-- 리텐핏 구독·결제·운영 분석 스키마 (Supabase / Postgres)
-- 원칙: 사장님은 자기 행만 읽고, 운영자(admins)만 전체를 읽습니다.
--       구독·결제·결제수단은 서버(Edge Functions의 service role)만 씁니다(브라우저 쓰기 정책 없음).

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  email text,
  phone text,
  shop_name text,
  agreed_at timestamptz,
  created_on date not null default (now() at time zone 'Asia/Seoul')::date
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null check (status in ('trial', 'active', 'past_due', 'canceled', 'ended')),
  intro boolean not null default true,
  started_on date not null,
  charges_done int not null default 0,
  next_charge_on date not null,
  failed_count int not null default 0,
  canceled_on date,
  ended_on date,
  last_payment_id text,
  updated_at timestamptz not null default now()
);

-- 결제 수단(빌링키): 정책이 없어 브라우저에서는 읽을 수도 쓸 수도 없음
create table if not exists public.billing_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  billing_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key, -- PortOne paymentId (같은 번호로 두 번 결제되지 않음)
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null,
  charge_index int not null,
  status text not null check (status in ('paid', 'failed', 'cancelled')),
  paid_on date not null,
  pg_tx_id text,
  failure text,
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments (user_id, paid_on desc);

-- 앱이 하루 한 번 올리는 매장 집계 숫자(손님 개인정보 없음)
create table if not exists public.store_metrics (
  user_id uuid primary key references auth.users (id) on delete cascade,
  synced_on date not null,
  data jsonb not null
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_keys enable row level security;
alter table public.payments enable row level security;
alter table public.store_metrics enable row level security;
alter table public.admins enable row level security;

create policy profiles_read on public.profiles for select using (user_id = auth.uid() or public.is_admin());
create policy subscriptions_read on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy payments_read on public.payments for select using (user_id = auth.uid() or public.is_admin());
create policy metrics_read on public.store_metrics for select using (user_id = auth.uid() or public.is_admin());
create policy metrics_insert_own on public.store_metrics for insert with check (user_id = auth.uid());
create policy metrics_update_own on public.store_metrics for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy admins_read_self on public.admins for select using (user_id = auth.uid());

-- 권한(이중 안전장치): 브라우저(anon·authenticated)는 읽기만 하고 행 단위 보안이 다시 거름. 결제 수단 표는 브라우저 접근 자체를 막음
revoke all on public.billing_keys from anon, authenticated;
revoke insert, update, delete on public.profiles, public.subscriptions, public.payments, public.admins from anon, authenticated;
grant select on public.profiles, public.subscriptions, public.payments, public.store_metrics, public.admins to authenticated;
grant insert, update on public.store_metrics to authenticated;
grant all on public.profiles, public.subscriptions, public.billing_keys, public.payments, public.store_metrics, public.admins to service_role;

-- 운영자 등록(처음 한 번, SQL 편집기에서 실행): 카카오로 한 번 로그인한 뒤
--   insert into public.admins (user_id) select id from auth.users where email = '운영자 카카오 이메일';
--
-- 하루 한 번 정기결제(대시보드에서 pg_cron·pg_net 확장을 켠 뒤 실행, 한국 시간 오전 10시 = UTC 01:00):
--   select cron.schedule('retenfit-renew', '0 1 * * *', $$
--     select net.http_post(
--       url := 'https://프로젝트ID.supabase.co/functions/v1/renew',
--       headers := jsonb_build_object('x-cron-secret', 'CRON_SECRET에 넣은 값')
--     );
--   $$);
