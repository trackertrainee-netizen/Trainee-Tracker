"""Supabase queries for the existing organization and trainee workflow schema."""

import hashlib
import os
from uuid import UUID

from postgrest.exceptions import APIError
from supabase import AuthApiError, create_client
from supabase.lib.client_options import SyncClientOptions


def trainee_auth_email(username):
    normalized = " ".join(username.strip().split()).casefold()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:56]
    return f"trainee-{digest}@trainee-tracker.invalid"


def presentation_prefix(trainee_name, trainee_id):
    folder_name = trainee_name.strip().replace("/", "-").replace("\\", "-")
    if not folder_name or folder_name in (".", ".."):
        raise ValueError("The trainee must have a valid name to store presentations.")
    return f"{folder_name}/{trainee_id}"


class DataBase:
    def __init__(self, url, api_key, access_token=None):
        if not url or not api_key:
            raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY in the existing .env file.")
        self.url = url
        options = (
            SyncClientOptions(headers={"Authorization": f"Bearer {access_token}"})
            if access_token
            else None
        )
        self.client = create_client(url, api_key, options=options)
        if access_token:
            self.client.postgrest.auth(access_token)

    def _auth_admin_client(self):
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_key:
            raise RuntimeError(
                "Set SUPABASE_SERVICE_ROLE_KEY in the server environment for privileged Supabase operations."
            )
        return create_client(self.url, service_key)

    def _create_auth_user(self, admin, name, password):
        normalized_name = " ".join(name.split()).casefold()
        if "@" in name or normalized_name == "developer":
            raise ValueError("Choose a trainee name that is not an email or the reserved username 'developer'.")
        try:
            return admin.auth.admin.create_user({
                "email": trainee_auth_email(name),
                "password": password,
                "email_confirm": True,
                "user_metadata": {"username": name, "full_name": name},
            }).user
        except AuthApiError as exc:
            code = getattr(exc.code, "value", exc.code)
            if code in ("email_exists", "user_already_exists"):
                raise ValueError(
                    "That trainee name is already in use as a username. Use a unique name."
                ) from None
            raise

    def _create_trainee_account(self, admin, trainee_id, payload, password):
        name = payload["name"]
        auth_user = self._create_auth_user(admin, name, password)

        trainee_inserted = False
        try:
            self.client.table("trainees").insert(payload).execute()
            trainee_inserted = True
            admin.table("profiles").upsert(
                {
                    "id": auth_user.id,
                    "full_name": name,
                    "role": "trainee",
                    "trainee_id": trainee_id,
                },
                on_conflict="id",
            ).execute()
        except (APIError, AuthApiError) as exc:
            cleanup_errors = []
            try:
                admin.table("profiles").delete().eq("id", auth_user.id).execute()
            except APIError as cleanup_error:
                cleanup_errors.append(cleanup_error)
            try:
                admin.auth.admin.delete_user(auth_user.id)
            except AuthApiError as cleanup_error:
                cleanup_errors.append(cleanup_error)
            if trainee_inserted:
                try:
                    self.client.table("trainees").delete().eq("id", trainee_id).execute()
                except APIError as cleanup_error:
                    cleanup_errors.append(cleanup_error)
            if cleanup_errors:
                raise RuntimeError(
                    "Trainee login setup failed and automatic cleanup was incomplete. Check the trainee and Auth records."
                ) from cleanup_errors[0]
            raise

    def set_trainee_login(self, trainee_id, password):
        try:
            trainee_id = str(UUID(str(trainee_id)))
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Choose a valid trainee.") from None
        if not isinstance(password, str) or len(password) < 6:
            raise ValueError("Set a login password of at least 6 characters.")

        admin = self._auth_admin_client()
        trainee = (
            admin.table("trainees")
            .select("id,name")
            .eq("id", trainee_id)
            .maybe_single()
            .execute()
            .data
        )
        if not trainee:
            raise ValueError("Trainee not found.")

        name = trainee["name"].strip()
        attributes = {
            "email": trainee_auth_email(name),
            "password": password,
            "email_confirm": True,
            "user_metadata": {"username": name, "full_name": name},
        }
        linked_profiles = (
            admin.table("profiles")
            .select("id")
            .eq("trainee_id", trainee_id)
            .limit(2)
            .execute()
            .data
        )
        if len(linked_profiles) > 1:
            raise ValueError("This trainee has multiple linked accounts. Ask an administrator to check the profiles.")
        if linked_profiles:
            user_id = linked_profiles[0]["id"]
            admin.auth.admin.update_user_by_id(user_id, attributes)
            admin.table("profiles").update({"full_name": name}).eq("id", user_id).execute()
        else:
            auth_user = self._create_auth_user(admin, name, password)
            try:
                admin.table("profiles").upsert(
                    {
                        "id": auth_user.id,
                        "full_name": name,
                        "role": "trainee",
                        "trainee_id": trainee_id,
                    },
                    on_conflict="id",
                ).execute()
            except (APIError, AuthApiError) as exc:
                try:
                    admin.auth.admin.delete_user(auth_user.id)
                except AuthApiError as cleanup_error:
                    raise RuntimeError(
                        "Trainee login setup failed and automatic cleanup was incomplete. Check the Auth account."
                    ) from cleanup_error
                raise exc
        return name

    def sign_in(self, email, password):
        return self.client.auth.sign_in_with_password(
            {"email": email, "password": password}
        )

    def current_user(self, access_token):
        return self.client.auth.get_user(access_token).user

    def profile(self, user_id):
        return (
            self.client.table("profiles")
            .select("id,full_name,role,business_id,branch_id,department_id,trainee_id")
            .eq("id", user_id)
            .maybe_single()
            .execute()
            .data
        )

    def list_options(self):
        businesses = self.client.table("businesses").select("id,name").execute().data
        branches = self.client.table("branches").select(
            "id,business_id"
        ).execute().data
        business_by_branch = {
            branch["id"]: branch["business_id"] for branch in branches
        }
        departments = self.client.table("departments").select(
            "id,branch_id,name"
        ).execute().data
        return {
            "businesses": businesses,
            "departments": [
                {
                    "id": department["id"],
                    "business_id": business_by_branch.get(department["branch_id"]),
                    "name": department["name"],
                }
                for department in departments
            ],
            "designations": self.client.table("designations").select(
                "id,department_id,title"
            ).execute().data,
        }

    def list_video_task_mappings(self):
        return (
            self._auth_admin_client()
            .table("video_task_mappings")
            .select("business_id,task_key,video_folder")
            .execute()
            .data
        )

    def save_video_task_mapping(self, business_id, task_key, folder):
        query = self._auth_admin_client().table("video_task_mappings")
        if folder:
            query.upsert(
                {
                    "business_id": business_id,
                    "task_key": task_key,
                    "video_folder": folder,
                },
                on_conflict="business_id,task_key",
            ).execute()
        else:
            query.delete().eq("business_id", business_id).eq(
                "task_key", task_key
            ).execute()

    def create_organization_record(self, entity, name, parent_id=None):
        definitions = {
            "business": ("businesses", "name", None, None),
            "department": ("departments", "name", "businesses", "business_id"),
            "designation": ("designations", "title", "departments", "department_id"),
        }
        if not isinstance(entity, str) or entity not in definitions:
            raise ValueError("Choose a valid organization type.")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Enter a name.")
        name = name.strip()
        if len(name) > 120:
            raise ValueError("Names must be 120 characters or fewer.")

        table, name_column, parent_table, parent_column = definitions[entity]
        payload = {name_column: name}
        branch_ids = set()
        if parent_table:
            try:
                parent_id = str(UUID(str(parent_id)))
            except (ValueError, TypeError, AttributeError):
                raise ValueError("Choose a valid parent organization.") from None
            parent = (
                self.client.table(parent_table)
                .select("id")
                .eq("id", parent_id)
                .maybe_single()
                .execute()
                .data
            )
            if not parent:
                raise ValueError("Choose an existing parent organization.")
            if entity == "department":
                branches = (
                    self.client.table("branches")
                    .select("id")
                    .eq("business_id", parent_id)
                    .execute()
                    .data
                )
                if not branches:
                    raise ValueError(
                        "This business has no compatible existing organization record."
                    )
                payload["branch_id"] = branches[0]["id"]
                branch_ids = {branch["id"] for branch in branches}
            else:
                payload[parent_column] = parent_id

        if entity == "department":
            existing_departments = (
                self.client.table(table)
                .select("id,branch_id")
                .eq(name_column, payload[name_column])
                .execute()
                .data
            )
            duplicate = any(
                row["branch_id"] in branch_ids for row in existing_departments
            )
        else:
            duplicate_query = (
                self.client.table(table)
                .select("id")
                .eq(name_column, payload[name_column])
            )
            if parent_column:
                duplicate_query = duplicate_query.eq(parent_column, parent_id)
            duplicate = bool(duplicate_query.limit(1).execute().data)
        if duplicate:
            raise ValueError(f"A {entity} with that name already exists.")

        return self.client.table(table).insert(payload).execute().data

    def list_trainees(self):
        rows = self.client.table("trainee_workflow").select("*").execute().data
        return [
            {
                **row,
                "logs": row.get("logs") or [],
                "scores": row.get("scores") or {},
            }
            for row in rows
        ]

    def save_trainees(self, rows, profile):
        if not isinstance(rows, list):
            raise ValueError("Expected a list of trainee records.")

        current = self.client.table("trainee_workflow").select("id,name").execute().data
        current_ids = {row["id"] for row in current}
        current_progress = (
            self.client.table("trainee_progress")
            .select("trainee_id,step_index")
            .execute()
            .data
        )
        existing_progress = {
            (row["trainee_id"], int(row["step_index"])) for row in current_progress
        }
        incoming_ids = set()
        trainee_role = profile["role"] == "trainee"
        admin = None

        for item in rows:
            trainee_id = item.get("id")
            try:
                trainee_id = str(UUID(str(trainee_id)))
            except (ValueError, TypeError, AttributeError):
                raise ValueError("Each trainee must have a valid UUID.") from None
            if trainee_id in incoming_ids:
                raise ValueError("The trainee list contains a duplicate ID.")
            incoming_ids.add(trainee_id)

            if trainee_role and trainee_id != profile.get("trainee_id"):
                raise ValueError("A trainee account can update only its own record.")

            if trainee_id in current_ids:
                if not trainee_role:
                    self.client.table("trainees").update(
                        self._trainee_fields(item)
                    ).eq("id", trainee_id).execute()
            else:
                if trainee_role:
                    raise ValueError("A trainee account cannot create trainee records.")
                password = item.get("account_password")
                if not isinstance(password, str) or len(password) < 6:
                    raise ValueError("Set a trainee login password of at least 6 characters.")
                if admin is None:
                    admin = self._auth_admin_client()
                payload = self._trainee_fields(item)
                payload["id"] = trainee_id
                payload["designation_id"] = self._designation_id(item)
                self._create_trainee_account(admin, trainee_id, payload, password)
                existing_progress.add((trainee_id, 0))

            for log in item.get("logs") or []:
                try:
                    step_index = int(log["s"])
                except (KeyError, TypeError, ValueError):
                    raise ValueError("A workflow log has an invalid step index.") from None
                progress = {
                    "trainee_id": trainee_id,
                    "step_index": step_index,
                    "started_at": log.get("st"),
                    "completed_at": log.get("c"),
                    "presentation": log.get("pdf"),
                }
                if not trainee_role:
                    progress.update({
                        "assigned_at": log.get("a"),
                        "verified_by": log.get("v"),
                        "verified_at": log.get("vt"),
                    })
                progress_query = self.client.table("trainee_progress")
                progress_key = (trainee_id, step_index)
                if progress_key in existing_progress:
                    progress_query.update(progress).eq(
                        "trainee_id", trainee_id
                    ).eq("step_index", step_index).execute()
                else:
                    progress_query.insert(progress).execute()
                    existing_progress.add(progress_key)

            if not trainee_role:
                for module_index, score in (item.get("scores") or {}).items():
                    try:
                        index = int(module_index)
                    except (TypeError, ValueError):
                        raise ValueError("A module score has an invalid module index.") from None
                    self.client.table("trainee_module_scores").upsert(
                        {
                            "trainee_id": trainee_id,
                            "module_index": index,
                            "score": score["sc"],
                            "remark": score.get("rm", ""),
                        },
                        on_conflict="trainee_id,module_index",
                    ).execute()

        if not trainee_role:
            for trainee in current:
                trainee_id = trainee["id"]
                if trainee_id in incoming_ids:
                    continue
                admin = admin or self._auth_admin_client()
                prefix = presentation_prefix(trainee["name"], trainee_id)
                bucket = admin.storage.from_("presentations")
                files = bucket.list(prefix, {"limit": 1000})
                paths = [
                    f"{prefix}/{item['name']}"
                    for item in files
                    if isinstance(item, dict) and isinstance(item.get("name"), str)
                ]
                if paths:
                    bucket.remove(paths)
                self.client.table("trainees").delete().eq("id", trainee_id).execute()

        return len(rows)

    @staticmethod
    def _trainee_fields(item):
        return {
            "name": item.get("name", "").strip(),
            "joining_date": item.get("join"),
            "salary_per_month": item.get("sal") or 0,
            "wage_per_day": item.get("wage") or 0,
        }

    def _designation_id(self, item):
        business = self._one("businesses", "name", item.get("biz"))
        branches = (
            self.client.table("branches")
            .select("id")
            .eq("business_id", business["id"])
            .execute()
            .data
        )
        branch_ids = {branch["id"] for branch in branches}
        departments = (
            self.client.table("departments")
            .select("id,branch_id")
            .eq("name", item.get("dept"))
            .execute()
            .data
        )
        department_ids = [
            department["id"]
            for department in departments
            if department["branch_id"] in branch_ids
        ]
        if not department_ids:
            raise ValueError("No matching department was found for this trainee.")
        for department_id in department_ids:
            try:
                designation = self._one(
                    "designations",
                    "title",
                    item.get("desg"),
                    department_id=department_id,
                )
            except ValueError:
                continue
            return designation["id"]
        raise ValueError("No matching designation was found for this trainee.")

    def _one(self, table, column, value, **filters):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"Select a valid {table[:-1]}.")
        query = self.client.table(table).select("id").eq(column, value.strip())
        for key, filter_value in filters.items():
            query = query.eq(key, filter_value)
        rows = query.limit(1).execute().data
        if not rows:
            raise ValueError(f"No matching {table[:-1]} was found for this trainee.")
        return rows[0]
