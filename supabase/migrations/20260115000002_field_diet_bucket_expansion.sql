-- Field Diet v1: extend normalized estimates with non-PII context
alter table public.estimates_normalized
add column if not exists client_id text,
add column if not exists job_id text,
add column if not exists geo_city text,
add column if not exists geo_postal text;

comment on column public.estimates_normalized.client_id is 'Opaque client identifier (nullable, non-PII)';
comment on column public.estimates_normalized.job_id is 'Opaque job identifier (nullable, non-PII)';
comment on column public.estimates_normalized.geo_city is 'Lowercased city only (no street)';
comment on column public.estimates_normalized.geo_postal is 'Postal/zip (as provided) for downstream prefix bucketing';

-- Bucket expansion: repeat client + geography aggregates (safe, aggregate-only)
alter table public.estimate_buckets
add column if not exists repeat_client_ratio numeric default 0,
add column if not exists repeat_client_count integer default 0,
add column if not exists unique_client_count integer default 0,
add column if not exists geo_city_distribution jsonb not null default '[]',
add column if not exists geo_postal_prefix_distribution jsonb not null default '[]',
add column if not exists repeat_by_price_band jsonb not null default '[]';

comment on column public.estimate_buckets.repeat_client_ratio is 'Repeat client share (repeat_client_count / unique_client_count)';
comment on column public.estimate_buckets.repeat_client_count is 'Clients with 2+ meaningful estimates';
comment on column public.estimate_buckets.unique_client_count is 'Distinct clients present in estimates';
comment on column public.estimate_buckets.geo_city_distribution is 'Top cities by estimate count (aggregate only, lowercased)';
comment on column public.estimate_buckets.geo_postal_prefix_distribution is 'Top postal prefixes (zip3-style), aggregate only';
comment on column public.estimate_buckets.repeat_by_price_band is 'Optional repeat signals segmented by price band (aggregate only)';
