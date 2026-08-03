-- Cathay fare tracker — run once against Postgres (Neon).
--   psql "$DATABASE_URL" -f schema.sql
-- Everything lives in the default schema, prefixed by usage rather than
-- name because the database is dedicated to the tracker.

create table if not exists watches (
  id            bigint generated always as identity primary key,
  origin        text        not null,
  destination   text        not null,
  depart_from   date        not null,
  depart_to     date        not null,
  trip_days     integer,              -- null = price one-way; N = return N days after departure
  cabin         text        not null default 'ECONOMY',
  airlines_only text[],               -- allowlist; the hard filter, preferred over exclude_lcc
  exclude_lcc   boolean     not null default true,
  max_price     numeric,              -- HKD ceiling for under_ceiling alerts
  target_cpp    numeric,              -- HKD per status point for cpp_target alerts
  active        boolean     not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists quotes (
  id                 bigint generated always as identity primary key,
  watch_id           bigint      not null references watches (id) on delete cascade,
  fetched_at         timestamptz not null default now(),
  environment        text        not null default 'test',  -- amadeus test fares are cached, not live
  depart_date        date,
  return_date        date,
  price              numeric     not null,                 -- HKD, best offer this run
  carrier            text,
  booking_class      text,
  fare_type          text,                                 -- flex | essential | light | unknown
  status_points      integer,                              -- null when the earning table has no answer
  points_upper_bound boolean     not null default false,   -- true when fare_type was unknown and points assume Flex
  cpp                numeric,                              -- price / status_points, null when points unknown
  raw                jsonb                                 -- the winning offer, for audit; never logged
);

create index if not exists quotes_watch_fetched_idx on quotes (watch_id, fetched_at desc);

-- Alert dedup ledger. bucket is a 12-hour window key like '2026-08-03T12'
-- WRITTEN BY THE APPLICATION — it cannot be derived from sent_at in the
-- index, because casting a timestamptz to text/date is only STABLE, not
-- IMMUTABLE, and Postgres rejects such expressions in unique indexes.
create table if not exists alerts (
  id       bigint generated always as identity primary key,
  watch_id bigint      not null references watches (id) on delete cascade,
  quote_id bigint      references quotes (id) on delete set null,
  reason   text        not null,  -- new_low | under_ceiling | cpp_target | big_drop
  bucket   text        not null,  -- app-computed 12h window key
  detail   text,
  sent_at  timestamptz not null default now(),
  unique (watch_id, reason, bucket)
);

-- Dashboard rollup.
create or replace view watch_stats as
select
  w.id                                                   as watch_id,
  count(q.id)                                            as observations,
  min(q.price)                                           as all_time_low,
  percentile_cont(0.5) within group (order by q.price)   as median_price,
  (array_agg(q.price order by q.fetched_at desc))[1]     as latest_price,
  (array_agg(q.fetched_at order by q.fetched_at desc))[1] as last_checked,
  min(q.cpp)                                             as best_cpp
from watches w
left join quotes q on q.watch_id = w.id
group by w.id;
