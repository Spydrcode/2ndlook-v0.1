-- Add job_type_distribution to estimate_buckets for safe aggregate-only signals
alter table public.estimate_buckets
add column if not exists job_type_distribution jsonb not null default '[]';

comment on column public.estimate_buckets.job_type_distribution is
  'Bucketed counts by job_type (safe aggregate, no raw identifiers)';
