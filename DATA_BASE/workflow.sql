-- Additive workflow schema for the existing businesses/branches/departments/
-- designations/trainees/profiles schema. This does not drop existing data.

-- Run this enum migration by itself before executing the rest of this file.
alter type public.user_role add value if not exists 'business_hr';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (
    role::text in ('developer', 'business', 'business_hr', 'business_view', 'trainee')
  );

create table if not exists public.training_modules (
  module_index smallint primary key check (module_index between 0 and 4),
  name text not null,
  max_score numeric(4,2) not null default 10 check (max_score > 0)
);

create table if not exists public.training_steps (
  step_index smallint primary key check (step_index between 0 and 32),
  module_index smallint not null references public.training_modules(module_index),
  step_type text not null check (step_type in ('VIDEO', 'TASK', 'PRE')),
  title text not null,
  planned_minutes smallint not null check (planned_minutes > 0),
  monitored_by text not null
);

create table if not exists public.video_task_mappings (
  business_id uuid not null references public.businesses(id) on delete cascade,
  task_key text not null check (length(btrim(task_key)) > 0),
  video_folder text not null check (length(btrim(video_folder)) > 0),
  primary key (business_id, task_key)
);

create table if not exists public.trainee_progress (
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  step_index smallint not null references public.training_steps(step_index),
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  presentation jsonb,
  primary key (trainee_id, step_index),
  check ((verified_at is null) = (verified_by is null)),
  check (presentation is null or jsonb_typeof(presentation) = 'object')
);

create table if not exists public.video_watch_completions (
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  step_index smallint not null references public.training_steps(step_index),
  watched_at timestamptz not null default now(),
  primary key (trainee_id, step_index)
);

create table if not exists public.video_replay_requests (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  step_index smallint not null references public.training_steps(step_index),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'used')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint video_replay_requests_review_audit_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

alter table public.video_replay_requests
  drop constraint if exists video_replay_requests_reviewed_by_fkey;
alter table public.video_replay_requests
  add constraint video_replay_requests_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles(id) on delete set null;
alter table public.video_replay_requests
  drop constraint if exists video_replay_requests_check;
alter table public.video_replay_requests
  drop constraint if exists video_replay_requests_review_audit_check;
alter table public.video_replay_requests
  add constraint video_replay_requests_review_audit_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status <> 'pending' and reviewed_at is not null)
  );

create unique index if not exists idx_video_replay_requests_pending
  on public.video_replay_requests (trainee_id, step_index)
  where status = 'pending';

create table if not exists public.trainee_module_scores (
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  module_index smallint not null references public.training_modules(module_index),
  score numeric(4,2) not null check (score >= 0 and score <= 10),
  remark text not null default '',
  updated_at timestamptz not null default now(),
  primary key (trainee_id, module_index)
);

insert into public.training_modules (module_index, name, max_score) values
  (0, 'Module 1 · HR Onboarding', 10),
  (1, 'Module 2 · Marketing', 10),
  (2, 'Module 3 · Sales', 10),
  (3, 'Module 4 · Branch & Productivity', 10),
  (4, 'Module 5 · SCM & Operations', 10)
on conflict (module_index) do nothing;

insert into public.training_steps
  (step_index, module_index, step_type, title, planned_minutes, monitored_by)
values
  (0, 0, 'PRE',   'Magnus Introduction', 20, 'HR Team'),
  (1, 0, 'PRE',   'Magnus Business Hierarchy', 10, 'HR Team'),
  (2, 0, 'PRE',   'Magnus Branch Hierarchy', 10, 'HR Team'),
  (3, 0, 'TASK',  'Create complete business hierarchy and overview', 40, 'HR Team'),
  (4, 0, 'PRE',   'Student Life Cycle', 40, 'HR Team'),
  (5, 0, 'TASK',  'Create a complete presentation of student life cycle', 60, 'HR Team'),
  (6, 0, 'TASK',  'Make a mock call to Magnus as a customer', 30, 'HR Team'),
  (7, 0, 'PRE',   'Course structure presentation', 50, 'HR Team'),
  (8, 0, 'VIDEO', 'Marketing introduction', 11, 'HR Team'),
  (9, 0, 'TASK',  'Analyse marketing strategies of Magnus', 30, 'HR Team'),

  (10, 1, 'VIDEO', 'Target setting', 150, 'HR Team'),
  (11, 1, 'TASK',  'Presentation on need and use of market segmentation and target setting', 50, 'HR Team'),
  (12, 1, 'VIDEO', 'Customer acquisition', 51, 'HR Team'),
  (13, 1, 'TASK',  'Presentation on how to acquire customers as an EdTech', 40, 'HR Team'),
  (14, 1, 'VIDEO', 'Branding', 14, 'HR Team'),
  (15, 1, 'TASK',  'Presentation on branding of Magnus', 30, 'HR Team'),
  (16, 1, 'VIDEO', 'Orientation and meeting', 90, 'HR Team'),
  (17, 1, 'TASK',  'Analyse current orientation meeting checklist and present', 30, 'HR Team'),

  (18, 2, 'TASK',  'Orientation submission', 110, 'Senior Manager'),
  (19, 2, 'VIDEO', 'Sales', 90, 'HR'),
  (20, 2, 'VIDEO', 'Sales part 2', 37, 'HR'),
  (21, 2, 'TASK',  'How a branch can achieve sales and monitor sales', 40, 'Senior Manager'),
  (22, 2, 'TASK',  'Final submission on marketing – what is Magnus and the marketing side of Magnus', 60, 'Senior Manager'),

  (23, 3, 'VIDEO', 'Business hierarchy', 20, 'HR'),
  (24, 3, 'VIDEO', 'Productivity – branch level', 20, 'HR'),
  (25, 3, 'VIDEO', 'Administration on KPI', 37, 'HR'),
  (26, 3, 'VIDEO', 'Profitability', 30, 'HR'),
  (27, 3, 'TASK',  'Create branch level employee KPI and importance of productivity', 50, 'HR'),
  (28, 3, 'PRE',   'Loan and importance of skill loan', 40, 'Loan Team'),
  (29, 3, 'PRE',   'SCM and roles and responsibilities of SCM', 60, 'SCM Head'),

  (30, 4, 'TASK', 'SCM – Billing sheet', 120, 'SCM Head'),
  (31, 4, 'TASK', 'SCM – Smart class', 120, 'SCM Head'),
  (32, 4, 'TASK', 'Final presentation on operations role', 120, 'Asst. Operations')
on conflict (step_index) do nothing;

insert into public.trainee_progress (trainee_id, step_index, assigned_at)
select id, 0, created_at
from public.trainees
on conflict (trainee_id, step_index) do nothing;

create index if not exists idx_training_steps_module
  on public.training_steps (module_index, step_index);
create index if not exists idx_trainee_progress_step
  on public.trainee_progress (step_index);
create index if not exists idx_video_replay_requests_created
  on public.video_replay_requests (created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('presentations', 'presentations', false, 26214400, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $migration$
declare
  in_scope_arguments text;
begin
  select pg_get_function_arguments(
    'public.in_scope(uuid, uuid, uuid)'::regprocedure
  )
  into in_scope_arguments;

  execute format($definition$
    create or replace function public.in_scope(%s)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public, pg_temp
    as $function$
      select exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and (
            profile.role::text = 'developer'
            or (
              profile.role::text in ('business', 'business_view', 'business_hr')
              and (
                (profile.role::text = 'business_hr' and profile.business_id is null)
                or profile.business_id = $1
              )
              and (profile.department_id is null or profile.department_id = $3)
            )
          )
      );
    $function$;
  $definition$, in_scope_arguments);
end;
$migration$;

grant execute on function public.in_scope(uuid, uuid, uuid) to authenticated;

drop policy if exists "presentation files read in scope" on storage.objects;
create policy "presentation files read in scope" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'presentations'
    and exists (
      select 1
      from public.trainees t
      join public.designations g on g.id = t.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where t.id::text = (storage.foldername(objects.name))[2]
        and (
          public.auth_trainee_id() = t.id
          or public.in_scope(b.business_id, b.id, d.id)
        )
    )
  );

drop policy if exists "presentation files upload own" on storage.objects;
create policy "presentation files upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'presentations'
    and (storage.foldername(objects.name))[2] = public.auth_trainee_id()::text
  );

drop policy if exists "presentation files replace own" on storage.objects;
create policy "presentation files replace own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'presentations'
    and (storage.foldername(objects.name))[2] = public.auth_trainee_id()::text
  )
  with check (
    bucket_id = 'presentations'
    and (storage.foldername(objects.name))[2] = public.auth_trainee_id()::text
  );

alter table public.training_modules enable row level security;
alter table public.training_steps enable row level security;
alter table public.video_task_mappings enable row level security;
alter table public.trainee_progress enable row level security;
alter table public.trainee_module_scores enable row level security;
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.departments enable row level security;
alter table public.designations enable row level security;

drop policy if exists "business HR manages trainees in scope" on public.trainees;
create policy "business HR manages trainees in scope" on public.trainees
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.designations g on g.id = trainees.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where profile.id = auth.uid()
        and profile.role::text = 'business_hr'
        and public.in_scope(b.business_id, b.id, d.id)
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      join public.designations g on g.id = trainees.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where profile.id = auth.uid()
        and profile.role::text = 'business_hr'
        and public.in_scope(b.business_id, b.id, d.id)
    )
  );

drop policy if exists "organization business read in scope" on public.businesses;
create policy "organization business read in scope" on public.businesses
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and (
          profile.role::text = 'developer'
          or (
            profile.role::text in ('business', 'business_view', 'business_hr')
            and (
              (profile.role::text = 'business_hr' and profile.business_id is null)
              or profile.business_id = businesses.id
            )
          )
        )
    )
  );

drop policy if exists "organization branch read in scope" on public.branches;
create policy "organization branch read in scope" on public.branches
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and (
          profile.role::text = 'developer'
          or (
            profile.role::text in ('business', 'business_view', 'business_hr')
            and (
              (profile.role::text = 'business_hr' and profile.business_id is null)
              or profile.business_id = branches.business_id
            )
          )
        )
    )
  );

drop policy if exists "organization department read in scope" on public.departments;
create policy "organization department read in scope" on public.departments
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.branches branch on branch.id = departments.branch_id
      where profile.id = auth.uid()
        and (
          profile.role::text = 'developer'
          or (
            profile.role::text in ('business', 'business_view', 'business_hr')
            and (
              (profile.role::text = 'business_hr' and profile.business_id is null)
              or profile.business_id = branch.business_id
            )
            and (profile.department_id is null or profile.department_id = departments.id)
          )
        )
    )
  );

drop policy if exists "organization designation read in scope" on public.designations;
create policy "organization designation read in scope" on public.designations
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.departments department on department.id = designations.department_id
      join public.branches branch on branch.id = department.branch_id
      where profile.id = auth.uid()
        and (
          profile.role::text = 'developer'
          or (
            profile.role::text in ('business', 'business_view', 'business_hr')
            and (
              (profile.role::text = 'business_hr' and profile.business_id is null)
              or profile.business_id = branch.business_id
            )
            and (profile.department_id is null or profile.department_id = department.id)
          )
        )
    )
  );

drop policy if exists "organization business insert developer" on public.businesses;
create policy "organization business insert developer" on public.businesses
  for insert to authenticated
  with check (public.auth_role() = 'developer');

drop policy if exists "organization branch insert developer" on public.branches;
create policy "organization branch insert developer" on public.branches
  for insert to authenticated
  with check (public.auth_role() = 'developer');

drop policy if exists "organization department insert developer" on public.departments;
create policy "organization department insert developer" on public.departments
  for insert to authenticated
  with check (public.auth_role() = 'developer');

drop policy if exists "organization designation insert developer" on public.designations;
create policy "organization designation insert developer" on public.designations
  for insert to authenticated
  with check (public.auth_role() = 'developer');

drop policy if exists "video task mappings read in scope" on public.video_task_mappings;
create policy "video task mappings read in scope" on public.video_task_mappings
  for select to authenticated
  using (
    public.auth_role() = 'developer'
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and (
          (
            profile.role in ('business', 'business_view')
            and profile.business_id = video_task_mappings.business_id
          )
          or (
            profile.role::text = 'business_hr'
            and (
              profile.business_id is null
              or profile.business_id = video_task_mappings.business_id
            )
          )
        )
    )
    or exists (
      select 1
      from public.trainees t
      join public.designations g on g.id = t.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where t.id = public.auth_trainee_id()
        and public.auth_role() = 'trainee'
        and b.business_id = video_task_mappings.business_id
    )
  );

drop policy if exists "video task mappings insert developer" on public.video_task_mappings;
create policy "video task mappings insert developer" on public.video_task_mappings
  for insert to authenticated
  with check (public.auth_role() = 'developer');

drop policy if exists "video task mappings update developer" on public.video_task_mappings;
create policy "video task mappings update developer" on public.video_task_mappings
  for update to authenticated
  using (public.auth_role() = 'developer')
  with check (public.auth_role() = 'developer');

drop policy if exists "video task mappings delete developer" on public.video_task_mappings;
create policy "video task mappings delete developer" on public.video_task_mappings
  for delete to authenticated
  using (public.auth_role() = 'developer');

grant select, insert, update, delete on public.video_task_mappings to authenticated;

grant insert on public.businesses, public.branches, public.departments, public.designations
  to authenticated;

drop policy if exists "training modules read" on public.training_modules;
create policy "training modules read" on public.training_modules
  for select to authenticated using (true);

drop policy if exists "training steps read" on public.training_steps;
create policy "training steps read" on public.training_steps
  for select to authenticated using (true);

create or replace function public.can_edit_trainee_progress(p_trainee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.trainees t on t.id = p_trainee_id
    join public.designations g on g.id = t.designation_id
    join public.departments d on d.id = g.department_id
    join public.branches b on b.id = d.branch_id
    where profile.id = auth.uid()
      and (
        profile.role::text = 'developer'
        or (
          profile.role::text in ('business', 'business_hr')
          and public.in_scope(b.business_id, b.id, d.id)
        )
      )
  );
$$;

revoke all on function public.can_edit_trainee_progress(uuid) from public;
grant execute on function public.can_edit_trainee_progress(uuid) to authenticated;

drop policy if exists "trainee progress read in scope" on public.trainee_progress;
create policy "trainee progress read in scope" on public.trainee_progress
  for select to authenticated
  using (
    public.auth_trainee_id() = trainee_id
    or exists (
      select 1
      from public.trainees t
      join public.designations g on g.id = t.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where t.id = trainee_progress.trainee_id
        and public.in_scope(b.business_id, b.id, d.id)
    )
  );

drop policy if exists "trainee progress editor insert" on public.trainee_progress;
create policy "trainee progress editor insert" on public.trainee_progress
  for insert to authenticated
  with check (public.can_edit_trainee_progress(trainee_id));

create or replace function public.can_trainee_insert_progress(
  p_trainee_id uuid,
  p_step_index smallint
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.auth_trainee_id() is distinct from p_trainee_id then
    return false;
  end if;

  return (
    p_step_index = 0
    and not exists (
      select 1
      from public.trainee_progress p
      where p.trainee_id = p_trainee_id
    )
  ) or exists (
    select 1
    from public.trainee_progress p
    where p.trainee_id = p_trainee_id
      and p.step_index = p_step_index - 1
      and p.completed_at is not null
  );
end;
$$;

revoke all on function public.can_trainee_insert_progress(uuid, smallint) from public;
grant execute on function public.can_trainee_insert_progress(uuid, smallint) to authenticated;

drop policy if exists "trainee progress self insert next" on public.trainee_progress;
create policy "trainee progress self insert next" on public.trainee_progress
  for insert to authenticated
  with check (
    public.can_trainee_insert_progress(trainee_progress.trainee_id, trainee_progress.step_index)
    and verified_by is null
    and verified_at is null
  );

drop policy if exists "trainee progress editor update" on public.trainee_progress;
create policy "trainee progress editor update" on public.trainee_progress
  for update to authenticated
  using (public.can_edit_trainee_progress(trainee_id))
  with check (public.can_edit_trainee_progress(trainee_id));

drop policy if exists "trainee progress self update" on public.trainee_progress;
create policy "trainee progress self update" on public.trainee_progress
  for update to authenticated
  using (public.auth_trainee_id() = trainee_id)
  with check (public.auth_trainee_id() = trainee_id);

drop policy if exists "trainee progress editor delete" on public.trainee_progress;
create policy "trainee progress editor delete" on public.trainee_progress
  for delete to authenticated
  using (public.can_edit_trainee_progress(trainee_id));

create or replace function public.guard_trainee_progress()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.step_index > 0 and not exists (
      select 1
      from public.trainee_progress p
      where p.trainee_id = new.trainee_id
        and p.step_index = new.step_index - 1
        and p.completed_at is not null
    ) then
      raise exception 'The previous step must be completed before assignment';
    end if;
    if public.auth_role() = 'trainee' then
      if new.verified_by is not null or new.verified_at is not null then
        raise exception 'Trainees cannot verify steps';
      end if;
      new.assigned_at := now();
    end if;
  elsif public.auth_role() = 'trainee' then
    if new.step_index is distinct from old.step_index
       or new.assigned_at is distinct from old.assigned_at
       or new.verified_by is distinct from old.verified_by
       or new.verified_at is distinct from old.verified_at then
      raise exception 'Trainees cannot change assignment or verification';
    end if;
    if old.started_at is not null and new.started_at is distinct from old.started_at then
      raise exception 'A started step cannot be restarted';
    end if;
    if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
      raise exception 'A completed step cannot be changed';
    end if;
    if new.completed_at is not null and (old.started_at is null or new.started_at is null) then
      raise exception 'Start a step before completing it';
    end if;
  elsif new.verified_at is not null
        and (new.completed_at is null or new.verified_by is null) then
    raise exception 'A step must be completed and attributed before verification';
  end if;
  return new;
end;
$$;

drop trigger if exists trainee_progress_guard on public.trainee_progress;
create trigger trainee_progress_guard
  before insert or update on public.trainee_progress
  for each row execute function public.guard_trainee_progress();

create or replace function public.assign_first_training_step()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.trainee_progress (trainee_id, step_index, assigned_at)
  values (new.id, 0, new.created_at)
  on conflict (trainee_id, step_index) do nothing;
  return new;
end;
$$;

drop trigger if exists trainee_assign_first_step on public.trainees;
create trigger trainee_assign_first_step
  after insert on public.trainees
  for each row execute function public.assign_first_training_step();

drop policy if exists "trainee scores read in scope" on public.trainee_module_scores;
create policy "trainee scores read in scope" on public.trainee_module_scores
  for select to authenticated
  using (
    public.auth_trainee_id() = trainee_id
    or exists (
      select 1
      from public.trainees t
      join public.designations g on g.id = t.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where t.id = trainee_module_scores.trainee_id
        and public.in_scope(b.business_id, b.id, d.id)
    )
  );

drop policy if exists "trainee scores editor write" on public.trainee_module_scores;
create policy "trainee scores editor write" on public.trainee_module_scores
  for all to authenticated
  using (public.can_edit_trainee_progress(trainee_module_scores.trainee_id))
  with check (
    public.can_edit_trainee_progress(trainee_module_scores.trainee_id)
    and not exists (
      select 1
      from public.training_steps s
      where s.module_index = trainee_module_scores.module_index
        and not exists (
          select 1 from public.trainee_progress p
          where p.trainee_id = trainee_module_scores.trainee_id
            and p.step_index = s.step_index
            and p.completed_at is not null
        )
    )
  );

create or replace function public.guard_trainee_module_score()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.auth_role() = 'trainee' then
    raise exception 'Trainees cannot change module scores';
  end if;
  if exists (
    select 1
    from public.training_steps s
    where s.module_index = new.module_index
      and not exists (
        select 1 from public.trainee_progress p
        where p.trainee_id = new.trainee_id
          and p.step_index = s.step_index
        and p.completed_at is not null
      )
  ) then
  raise exception 'Every step in the module must be completed before scoring';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trainee_module_score_guard on public.trainee_module_scores;
create trigger trainee_module_score_guard
  before insert or update on public.trainee_module_scores
  for each row execute function public.guard_trainee_module_score();

grant select on public.training_modules, public.training_steps to authenticated;
grant select, insert, update, delete
  on public.trainee_progress, public.trainee_module_scores to authenticated;

create or replace view public.trainee_workflow
with (security_invoker = true)
as
select
  t.id,
  b.name as biz,
  br.name as branch,
  d.name as dept,
  g.title as desg,
  t.name,
  t.joining_date as "join",
  t.salary_per_month as sal,
  t.wage_per_day as wage,
  t.created_at as start,
  t.current_stage,
  coalesce(progress.logs, '[]'::jsonb) as logs,
  coalesce(scores.scores_json, '{}'::jsonb) as scores
from public.trainees t
join public.designations g on g.id = t.designation_id
join public.departments d on d.id = g.department_id
join public.branches br on br.id = d.branch_id
join public.businesses b on b.id = br.business_id
left join lateral (
  select jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      's', p.step_index,
      'a', p.assigned_at,
      'st', p.started_at,
      'c', p.completed_at,
      'v', p.verified_by,
      'vt', p.verified_at,
      'pdf', p.presentation
    )) order by p.step_index
  ) as logs
  from public.trainee_progress p
  where p.trainee_id = t.id
) progress on true
left join lateral (
  select jsonb_object_agg(
    s.module_index::text,
    jsonb_build_object('sc', s.score, 'rm', s.remark)
  ) as scores_json
  from public.trainee_module_scores s
  where s.trainee_id = t.id
) scores on true;

grant select on public.trainee_workflow to authenticated;

alter table public.video_watch_completions enable row level security;
alter table public.video_replay_requests enable row level security;

drop policy if exists "video completion read in scope" on public.video_watch_completions;
create policy "video completion read in scope" on public.video_watch_completions
  for select to authenticated
  using (
    public.auth_trainee_id() = trainee_id
    or exists (
      select 1
      from public.profiles profile
      join public.trainees t on t.id = video_watch_completions.trainee_id
      join public.designations g on g.id = t.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where profile.id = auth.uid()
        and (
          profile.role::text = 'developer'
          or (
            profile.role::text in ('business', 'business_hr')
            and public.in_scope(b.business_id, b.id, d.id)
          )
        )
    )
  );

drop policy if exists "trainee records video completion" on public.video_watch_completions;
create policy "trainee records video completion" on public.video_watch_completions
  for insert to authenticated
  with check (
    public.auth_role() = 'trainee'
    and public.auth_trainee_id() = trainee_id
    and exists (
      select 1 from public.training_steps s
      where s.step_index = video_watch_completions.step_index
        and s.step_type = 'VIDEO'
    )
  );

drop policy if exists "video replay request read in scope" on public.video_replay_requests;
create policy "video replay request read in scope" on public.video_replay_requests
  for select to authenticated
  using (
    public.auth_trainee_id() = trainee_id
    or exists (
      select 1
      from public.profiles profile
      join public.trainees t on t.id = video_replay_requests.trainee_id
      join public.designations g on g.id = t.designation_id
      join public.departments d on d.id = g.department_id
      join public.branches b on b.id = d.branch_id
      where profile.id = auth.uid()
        and (
          profile.role::text = 'developer'
          or (
            profile.role::text = 'business_hr'
            and public.in_scope(b.business_id, b.id, d.id)
          )
        )
    )
  );

drop policy if exists "trainee requests video replay" on public.video_replay_requests;
create policy "trainee requests video replay" on public.video_replay_requests
  for insert to authenticated
  with check (
    public.auth_role() = 'trainee'
    and public.auth_trainee_id() = trainee_id
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and exists (
      select 1
      from public.video_watch_completions w
      join public.training_steps s on s.step_index = w.step_index
      where w.trainee_id = video_replay_requests.trainee_id
        and w.step_index = video_replay_requests.step_index
        and s.step_type = 'VIDEO'
    )
  );

create or replace function public.can_review_video_replay_request(p_trainee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role::text = 'developer'
    )
    or exists (
      select 1
      from public.profiles profile
      join public.trainees t on t.id = p_trainee_id
        join public.designations g on g.id = t.designation_id
        join public.departments d on d.id = g.department_id
        join public.branches b on b.id = d.branch_id
      where profile.id = auth.uid()
        and profile.role::text = 'business_hr'
        and public.in_scope(b.business_id, b.id, d.id)
    );
$$;

revoke all on function public.can_review_video_replay_request(uuid) from public;
grant execute on function public.can_review_video_replay_request(uuid) to authenticated;

drop policy if exists "business HR reviews replay request" on public.video_replay_requests;
create policy "business HR reviews replay request" on public.video_replay_requests
  for update to authenticated
  using (
    status = 'pending'
    and public.can_review_video_replay_request(trainee_id)
  )
  with check (
    status in ('approved', 'declined')
    and reviewed_at is not null
    and reviewed_by = auth.uid()
    and public.can_review_video_replay_request(trainee_id)
  );

drop policy if exists "trainee uses approved replay request" on public.video_replay_requests;
create policy "trainee uses approved replay request" on public.video_replay_requests
  for update to authenticated
  using (
    public.auth_trainee_id() = trainee_id
    and status = 'approved'
  )
  with check (
    public.auth_trainee_id() = trainee_id
    and status = 'used'
    and reviewed_at is not null
    and reviewed_by is not null
  );

grant select, insert on public.video_watch_completions to authenticated;
grant select, insert on public.video_replay_requests to authenticated;
grant update (status, reviewed_at, reviewed_by) on public.video_replay_requests to authenticated;