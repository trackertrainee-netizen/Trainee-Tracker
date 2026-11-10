"""Supabase queries for the existing organization and trainee workflow schema."""

from uuid import UUID

from supabase import create_client


class DataBase:
    def __init__(self, url, api_key, access_token=None):
        if not url or not api_key:
            raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY in the existing .env file.")
        self.client = create_client(url, api_key)
        if access_token:
            self.client.postgrest.auth(access_token)

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
        return {
            "businesses": self.client.table("businesses").select("id,name").execute().data,
            "branches": self.client.table("branches").select(
                "id,business_id,name"
            ).execute().data,
            "departments": self.client.table("departments").select(
                "id,branch_id,name"
            ).execute().data,
            "designations": self.client.table("designations").select(
                "id,department_id,title"
            ).execute().data,
        }

    def create_organization_record(self, entity, name, parent_id=None):
        definitions = {
            "business": ("businesses", "name", None, None),
            "branch": ("branches", "name", "businesses", "business_id"),
            "department": ("departments", "name", "branches", "branch_id"),
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
            payload[parent_column] = parent_id

        duplicate_query = (
            self.client.table(table)
            .select("id")
            .eq(name_column, payload[name_column])
        )
        if parent_column:
            duplicate_query = duplicate_query.eq(parent_column, parent_id)
        if duplicate_query.limit(1).execute().data:
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

        current = self.client.table("trainee_workflow").select("id").execute().data
        current_ids = {row["id"] for row in current}
        incoming_ids = set()
        trainee_role = profile["role"] == "trainee"

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
                payload = self._trainee_fields(item)
                payload["id"] = trainee_id
                payload["designation_id"] = self._designation_id(item)
                self.client.table("trainees").insert(payload).execute()

            for log in item.get("logs") or []:
                try:
                    step_index = int(log["s"])
                except (KeyError, TypeError, ValueError):
                    raise ValueError("A workflow log has an invalid step index.") from None
                progress = {
                    "trainee_id": trainee_id,
                    "step_index": step_index,
                    "assigned_at": log.get("a"),
                    "started_at": log.get("st"),
                    "completed_at": log.get("c"),
                    "verified_by": log.get("v"),
                    "verified_at": log.get("vt"),
                    "presentation": log.get("pdf"),
                }
                self.client.table("trainee_progress").upsert(
                    progress, on_conflict="trainee_id,step_index"
                ).execute()

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
            for trainee_id in current_ids - incoming_ids:
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
        branch = self._one(
            "branches", "name", item.get("branch"), business_id=business["id"]
        )
        department = self._one(
            "departments", "name", item.get("dept"), branch_id=branch["id"]
        )
        designation = self._one(
            "designations",
            "title",
            item.get("desg"),
            department_id=department["id"],
        )
        return designation["id"]

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
