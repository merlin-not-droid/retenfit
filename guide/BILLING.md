# 구독 결제 · 카카오 로그인 · 운영자 분석 — 설정 안내

랜딩페이지 → **결제 페이지(카카오 로그인 → 카드 등록·첫 달 결제)** → 앱, 그리고 운영자만 보는 **운영자 분석**으로 이어집니다.

| 항목 | 값 |
|---|---|
| 요금 | 첫 3개월 **월 4,900원** → 4개월째부터 **월 8,900원** (부가세 포함, 매장 1곳) |
| 결제일 | 가입한 날 첫 결제, 이후 매달 가입한 날짜(없는 달은 말일) |
| 정가 전환 | 가입 때 동의 → 바뀌기 7일 전 안내(운영자 분석의 ‘안내 대상’) → 그 전에 해지하면 정가 결제 없음 |
| 결제 실패 | 1·3·5일 뒤 재시도(그동안 이용 가능), 모두 실패하면 종료 |
| 해지 | 언제든. 이미 낸 기간 끝까지 이용, 그 안에는 ‘해지 취소’ 가능. 체험가는 계정당 한 번 |

## 구조

```
GitHub Pages(정적)                         Supabase(서울 리전 권장)
  /           랜딩: 결제 페이지로 안내
  /checkout/  카카오 로그인 ─────────────▶ Auth(카카오 공급자)
              카드 등록(PortOne 결제창) → 빌링키
              가입 요청 ─────────────────▶ Edge Function billing: 첫 달 결제·단건 조회로 확인·구독 저장
  /app/       구독 확인 후 앱 열기, 하루 한 번 매장 집계 숫자 ─▶ store_metrics (손님 개인정보 없음)
  /admin/     운영자 분석 ───────────────▶ 테이블 조회(행 단위 보안: admins에 있는 계정만 전체 행)
                                            Edge Function renew: 매일(pg_cron) 결제일이 된 구독 결제
                                            Edge Function portone-webhook: 콘솔 취소·환불 반영
```

결제 규칙은 `supabase/functions/_shared/billing-core.js` 한 파일입니다(브라우저용 복사본 `src/assets/js/billing-core.js`는 테스트가 같은지 확인). 요청 처리(`billing-handler.js`)도 운영 서버와 로컬 테스트 서버가 같은 코드를 씁니다.

## 0. 먼저 로컬에서 흐름 보기 (계정 불필요)

```bash
node scripts/dev-backend.mjs
```

`http://localhost:4174/waxfit/` — 가짜 카카오 로그인(이름만 입력)과 가짜 카드로 가입·해지까지 해 볼 수 있습니다. 실제 결제는 일어나지 않습니다.

- 운영자 분석: `/waxfit/admin/`에서 이름을 **운영자**로 로그인(가상 구독 매장 36곳이 들어 있음)
- 시간 넘기기: `POST /__dev/api/clock` 에 `{"days": 31}` → 그사이 정기결제가 실행됨
- 결제 실패 확인: 결제 페이지의 ‘테스트 카드’를 ‘결제 실패’로

## 1. 준비물 (사장님·운영자가 직접)

- 사업자등록, 통신판매업 신고(대상 여부 확인), 정기결제가 되는 PG 계약(PortOne에서 신청)
- 카카오 디벨로퍼스 앱, Supabase 프로젝트, PortOne 계정
- 이용약관·환불·개인정보처리방침 확정(`src/legal/index.html`은 초안) — 출시 전 전문가 검토 권장

## 2. Supabase

1. 프로젝트 만들기(Region: Northeast Asia (Seoul) 권장).
2. SQL 편집기에서 `supabase/migrations/20261108000000_billing.sql` 실행.
3. Authentication → Sign In / Providers → **Kakao**: **Kakao enabled** 켜기, **REST API Key**·**Client Secret Code** 입력, **Allow users without an email** 켜기(이메일을 못 받는 계정도 가입이 막히지 않게 합니다. 코드는 이메일이 없어도 동작합니다).
4. Authentication → URL Configuration: **Site URL** `https://merlin-not-droid.github.io/waxfit/`, **Redirect URLs** `https://merlin-not-droid.github.io/waxfit/**`, `http://localhost:4173/waxfit/**`(로컬 확인용).

## 3. 카카오 디벨로퍼스

1. 앱 만들기, 앱 아이콘 등록.
2. 앱 > 일반 → **개인 개발자 비즈 앱 전환**(이메일 필수 동의). Supabase의 Kakao 공급자는 `account_email`을 항상 요청하므로(supabase/auth `kakao.go`), 이메일 권한이 없는 앱은 로그인 요청이 거부될 수 있습니다.
3. 카카오 로그인 > 동의항목: 닉네임 필수 동의, 프로필 사진 선택 동의, 카카오계정(이메일) 필수 동의. 프로필 사진은 앱에서 쓰지 않지만 Supabase가 함께 요청해서 켜 둡니다.
4. 앱 > 플랫폼 키 → REST API 키 수정: **카카오 로그인 리다이렉트 URI**에 `https://프로젝트ID.supabase.co/auth/v1/callback`. REST API 키와 클라이언트 시크릿 코드도 이 화면에 있습니다(이 두 값은 Supabase에만 넣음).
5. 카카오 로그인 > 일반: 사용 설정 ON.

## 4. PortOne(포트원) V2

콘솔은 https://admin.portone.io 이고, 가입은 계약 없이 무료입니다.

1. 결제 연동 → 연동 관리 → 채널 관리: 연동 모드 **테스트**로 채널을 추가합니다. 결제대행사 **토스페이먼츠**, 결제 모듈, 채널 속성 결제, 테스트 상점 아이디(공용 값이 보이면 선택).
2. 사이트 설정에 넣는 공개 값: 상점 ID(`store-…`), 채널 키(`channel-key-…`).
3. 결제 연동 → 연동 관리 → 식별코드·API Keys → V2 API: **새로운 API Secret 발급**. 발급 직후에만 보이므로 바로 `PORTONE_API_SECRET`에 넣습니다.
4. 결제 연동 → 연동 관리 → 결제알림(Webhook) 관리: 웹훅 버전 결제모듈 V2, 설정 모드 테스트, Endpoint URL `https://프로젝트ID.supabase.co/functions/v1/portone-webhook`, Content Type `application/json`. **웹훅 시크릿 발급** 값을 `PORTONE_WEBHOOK_SECRET`에 넣습니다. 테스트와 실연동은 주소와 시크릿을 따로 설정합니다.

지금 코드는 토스페이먼츠 기준입니다. KG이니시스는 `issueId`와 고객 이름·전화번호·이메일이 필수여서, 다른 PG로 바꾸려면 `src/assets/js/backend.js`와 `supabase/functions/_shared/portone.js`를 함께 고쳐야 합니다.

## 5. 서버 함수 배포와 비밀값

Docker 없이 `npx`로 배포합니다(Supabase CLI 3.0.0에서 확인). 처음 한 번 로그인합니다.

```bash
npx supabase@3.0.0 login
```

첫 입력 칸에서는 **Enter**만 누릅니다. 입력한 글자가 화면에 그대로 보이므로 비밀번호를 넣지 마세요. 브라우저에서 승인한 뒤 나오는 확인 코드만 터미널에 넣습니다.

세 함수를 한 번에 배포합니다. `--yes`는 CLI의 배포 확인 질문을 건너뛰는 옵션입니다.

```bash
npx supabase@3.0.0 functions deploy --remote=프로젝트ID --use-api --no-verify-jwt --yes
```

세 함수 모두 게이트웨이의 JWT 검사를 끕니다(`supabase/config.toml`에도 같은 설정). billing은 함수 안에서 로그인 토큰을 직접 확인하고, renew는 CRON_SECRET, portone-webhook은 서명으로 확인합니다. 새 공개 키 `sb_publishable_…`도 그대로 쓸 수 있습니다.

비밀값은 터미널 기록에 남지 않도록 대시보드 **Edge Functions → Secrets**에 직접 입력합니다.

- `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`: PortOne 콘솔에서 확인
- `CRON_SECRET`: 길고 임의의 문자열
- `SITE_ORIGIN`: 출시 직전에 `https://merlin-not-droid.github.io`로 넣습니다. 넣으면 그 주소에서만 호출할 수 있어 `localhost` 시험이 막힙니다.

그다음 Database → Extensions에서 **pg_cron**, **pg_net**을 켜고, 마이그레이션 파일 맨 아래 주석의 `cron.schedule(…)`을 프로젝트 ID·CRON_SECRET으로 바꿔 실행합니다(매일 한국 시간 오전 10시).

## 6. 사이트 연결

`src/assets/js/backend-config.js`에 **공개해도 되는 값만** 넣고 push 합니다.

```js
export default {
  mode: 'supabase',
  supabaseUrl: 'https://프로젝트ID.supabase.co',
  supabaseAnonKey: 'anon public 키',
  portone: { storeId: 'store-…', channelKey: 'channel-key-…' },
};
```

비밀 키(PortOne API Secret, 카카오 Client Secret, Supabase service role 키)는 절대 이 파일·저장소에 넣지 않습니다.

올리기 전에 내 컴퓨터에서 실제 로그인·결제를 시험하려면 파일은 `mode: 'off'` 그대로 두고 아래처럼 띄웁니다. 이 미리보기에서만 `supabase` 모드로 동작합니다.

```bash
npm run preview:live
```

주소는 `http://localhost:4173/waxfit/checkout/`입니다. Supabase **Redirect URLs**에 `http://localhost:4173/waxfit/**`가 있어야 카카오 로그인 뒤 돌아옵니다.

## 7. 운영자 등록 (나만 쓰는 분석 화면)

1. `/admin/`(또는 결제 페이지)에서 운영자 본인의 카카오로 한 번 로그인.
2. SQL 편집기에서 실행:

```sql
insert into public.admins (user_id) select id from auth.users where email = '운영자 카카오 이메일';
```

이메일을 받지 않았다면 Authentication → Users에서 본인 행의 User UID로 `insert into public.admins (user_id) values ('UID');`

운영자 분석에서 보는 것: 이용 중 매장(체험가·정가·결제 실패), 월 반복 매출, 이번 달·누적 결제액, 체험가→정가 전환율, 해지율, 최근 12개월 결제액·신규·해지, **정가 전환 7일 전 안내 대상**(안내 문구 복사), 결제 실패 목록, 매장 집계 지표, **매장 간 효과 실험 합산**, CSV 내려받기.

## 8. 열기 전 확인

- [ ] 테스트 채널로 가입 → 첫 결제 → 해지 → 해지 취소, `renew` 수동 호출로 다음 회차 결제 확인
- [ ] PortOne 콘솔에서 결제 취소 → 웹훅으로 결제 상태가 바뀌는지 확인
- [ ] `src/legal/index.html`에 사업자 정보·개인정보 보호책임자·서버 위치 기재, 약관·환불 기준 확정
- [ ] 정가 전환 7일 전 안내를 실제로 보낼 채널(문자·알림톡·이메일) 정하기 — 지금은 운영자 분석에서 대상과 문구를 뽑아 직접 보냄
- [ ] 결제 실패·해지 안내 방법, 영수증(PG 제공) 확인
- [ ] 카카오 **연결 해제 웹훅(User Unlinked)** 처리 정하기: 카카오 콘솔이 설정을 권장합니다. 회원이 카카오 쪽에서 연결을 끊어도 지금은 서비스가 알 수 없고, 이를 받는 서버 함수도 아직 없습니다.
- [ ] Supabase **Redirect URLs**에서 `http://localhost:4173/waxfit/**` 지우기, **Edge Functions → Secrets**에 `SITE_ORIGIN` 넣기
- [ ] 실 채널로 바꾼 뒤 소액 실결제 1건 → 취소로 마무리

## 보안 메모

- 카드 번호는 PG가 보관하고, 서버 DB에는 빌링키만 있습니다(`billing_keys` 테이블은 브라우저에서 읽기·쓰기 불가).
- 결제 성공은 브라우저가 아니라 서버가 PortOne 단건 조회로 금액·상태를 다시 확인한 뒤에만 인정합니다. 결제 번호가 회차별로 정해져 있어 같은 날 두 번 실행해도 중복 결제되지 않습니다.
- 운영자 분석의 데이터는 서버의 행 단위 보안(RLS)이 지킵니다. 운영자가 아닌 계정은 자기 행만 받습니다.
- 앱 화면의 구독 확인은 정적 사이트 특성상 화면 단계의 안내입니다. 손님 기록은 각 사장님 기기에만 있고 서버로 가지 않습니다.
