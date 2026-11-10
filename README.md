# RETENFIT (리텐핏)

[![사이트 배포](https://github.com/merlin-not-droid/retenfit/actions/workflows/deploy.yml/badge.svg)](https://github.com/merlin-not-droid/retenfit/actions/workflows/deploy.yml)

**사이트: <https://merlin-not-droid.github.io/retenfit/>**

**미용실·왁싱샵 사장님을 위한 재방문 설계 서비스.** 손님이 다시 올 때를 계산하고, 매장마다 다른 프로모션을 매달 추천합니다.
요금: 첫 3개월 월 4,900원 → 4개월째부터 월 8,900원(부가세 포함), 카카오 로그인 + 카드 정기결제. 설정: [guide/BILLING.md](guide/BILLING.md)

흐름: 처음 화면 → 업종별 소개 → 결제 → 대시보드. 업종은 색으로 구분합니다(미용실 초록, 왁싱샵 베이지·네이비).

| 주소 | 내용 | 검색 노출 |
|---|---|---|
| `/` | 처음 화면 — 세로로 반 나눈 두 서비스, 스크롤 없이 이해 | ✅ 대상 |
| `/salon/` | 미용실 서비스 소개 — 서비스 특징, 제공하는 기능, 얻는 이득, 가격, 자주 묻는 질문 | ✅ 대상 |
| `/wax/` | 왁싱샵 서비스 소개 — 같은 구성, 왁싱샵 계산 | ✅ 대상 |
| `/checkout/?service=salon\|wax` | 결제 — 카카오 로그인 → 동의 → 카드 등록·첫 달 결제, 내 구독(해지·해지 취소) | ❌ 제외(noindex) |
| `/salon/app/` | 미용실 대시보드 — 메뉴 5개: 이번 달 추천, 고객(고객 목록·재방문 현황·고객별 제안), 프로모션(프로모션 설계·관계·계절 전략), 매출, 설정(매장 설정·고객 데이터) | ❌ 제외(noindex) |
| `/wax/app/` | 왁싱샵 대시보드 — 메뉴 5개: 이번 달 추천, 고객(고객 목록·재방문 설계), 프로모션(첫 방문 유인·효과 실험), 매출·성과, 설정 | ❌ 제외(noindex) |
| `/admin/` | 운영자 분석 — 운영자 계정만 데이터 조회(서버 행 단위 보안) | ❌ 제외(noindex) |
| `/legal/` | 이용약관·정기결제·환불·개인정보(초안) | ✅ 대상 |
| `/app/` | 예전 주소. `/wax/app/`으로 넘겨 줍니다 | ❌ 제외(noindex) |

`?demo=1`을 붙이면 두 대시보드를 샘플 매장으로 열 수 있습니다(구독 확인 없음, 저장 안 됨).
결제 서버를 연결하기 전(`src/assets/js/backend-config.js`의 `mode: 'off'`)에는 결제 페이지가 요금만 보여 주고 결제 버튼을 막으며, 대시보드는 바로 열립니다.

## 추천이 매달 달라지는 방식

대시보드의 첫 화면입니다. 두 업종이 같은 엔진(`src/assets/js/promo-engine/`)을 씁니다.

1. **진단**: 방문 기록과 매장 진단(상권·개업 시기·후기·예약 여유·예산·시술별 손익)으로 어디서 이익이 새는지(첫 방문 유인 · 첫 재방문 전환 · 단골 만들기 · 유지)와 손님을 막는 심리 장벽 14가지의 강도를 계산합니다.
2. **추천**: 장치 36가지를 평가해 예산·일손·예약 여유 안에서 이번 달 플랜을 고르고, 손익 한도 안에서 첫 시험 강도를 정합니다. 그래서 매장마다 결과가 다릅니다.
3. **실행 기록**: 사장님이 실행을 기록하면 대상 손님 일부를 혜택 없는 비교군으로 나눕니다.
4. **다음 달 반영**: 지난달 기록(`state.monthlyPlans`)이 다음 달 계산에 들어갑니다.

| 지난달 상태 | 이번 달 처리 |
|---|---|
| 효과 확인(내 매장 결과의 90% 신뢰 하한이 0보다 큼) | 순위 ×1.1, 유지 |
| 효과 약함(90% 신뢰 상한이 기대의 절반 미만) | 순위 ×0.4 |
| 추천했지만 실행하지 않음 | 순위 ×0.7, 두 달 연속이면 ×0.4 |
| 실행 중, 결과 측정 중 | 최대 3개월 유지 |
| 측정 기간을 넘겨도 판단이 나지 않음 | 순위 ×0.6 |
| 최근 6개월 동안 추천한 적 없음 | 새로운 시도로 ×1.2 |

지난달과 조합이 똑같으면 근거가 가장 약한 추천을 빼 보면서 새 추천이 들어오는 조합을 찾습니다. 화면의 ‘이번 달 달라진 점’에 이유를 함께 보여 줍니다.

- 연결 코드: `src/salon/app/js/recommend.js`, `src/wax/app/js/recommend.js`(앱 데이터 → 엔진), 공통 기록은 `src/assets/js/monthly-record.js`
- 엔진은 별도 프로젝트 **promo-engine**(TypeScript 원본, 설계 문서 `docs/DESIGN.md`)에서 만든 브라우저용 파일입니다. **직접 고치지 말고** 원본을 고친 뒤 다시 만듭니다.

  ```bash
  node ../promo-engine/scripts/build-browser.mjs src/assets/js/promo-engine
  ```

- 효과 수치는 초기 가정값입니다. 화면에 근거 수준을 함께 표시하고, 비교군 결과가 쌓일수록 내 매장 결과의 비중이 커집니다.
- 실제 매장은 처음 계산할 때 만든 매장 키(`state.storeKey`)로 탐색 난수를 정해, 같은 달에 모든 매장이 같은 쪽으로 쏠리지 않습니다. 같은 매장은 같은 달 안에서 같은 난수를 씁니다. 샘플 매장은 탐색 없이 기대값이 가장 높은 조합을 보여 줍니다.

## 효과 측정

혜택을 받은 손님과 **받지 않은 손님(비교군)**을 같은 기간에 비교해 ‘프로모션이 없었어도 왔을 손님’을 빼고 효과를 잽니다.

| 업종 | 방식 | 결과 입력 |
|---|---|---|
| 미용실 | ‘이번 달 실행 기록’을 누르면 비교군으로 나눔 | 다음 달 고객 데이터를 올리면 최근 방문일로 60일 재방문 수를 자동 계산(`experimentOutcome`) |
| 왁싱샵 | 격주 교차, 결제 때 배정, 안내 발송 때 분리 | 방문 기록으로 자동 계산(`src/wax/app/js/experiments.js`) |

데이터는 이 기기의 브라우저에만 저장됩니다. 구독자의 경우 손님 개인정보가 없는 매장 집계 숫자만 하루 한 번 서버로 올라갑니다.

## 디자인 시스템

색·글자·간격은 `src/assets/tokens.css` 한 파일에 있고, 컴포넌트는 `--primary` 같은 역할 이름만 씁니다. 자세한 규칙은 [guide/DESIGN.md](guide/DESIGN.md#디자인-시스템)에 있습니다.

| 표면 | 표시 | 색 |
|---|---|---|
| 마케팅 | 기본 | 베이지·누드·브라운, 금색 테두리 |
| 미용실 | `<html data-service="salon">` | #214E42 · #E8EEE6 · #DCF1B4 · #F5F6F2 |
| 왁싱샵 | `<html data-service="wax">` | 베이지·누드, 네이비 포인트 |
| 운영자 | `<html data-surface="admin">` | 오프화이트·네이비 |

## 자동으로 해 주는 일

`main`에 push 할 때마다 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)이 실행됩니다.

1. **테스트** — 빌드 도구와 앱 계산 로직 (`npm test`)
2. **Pages 설정 확인** — 꺼져 있거나 ‘Deploy from a branch’면 배포를 건너뛰고 무엇을 눌러야 하는지 안내
3. **빌드** (`src/` → `dist/`)
   - 모든 페이지: canonical 주소, Open Graph(카카오톡·SNS 미리보기), `lang="ko"`, 파비콘
   - 홈: 구글·네이버 소유 확인 태그, 구조화 데이터(JSON-LD: 사이트 이름·브랜드·공식 채널)
   - `sitemap.xml`(페이지별 마지막 수정 시각 = 커밋 시각), `robots.txt`, `404.html`
   - 하위 경로(`/retenfit/`) 배포 시 `/salon/` 같은 링크를 자동 보정
4. **배포 전 검사** (`npm run check`) — 오류가 있으면 배포하지 않음
   - 제목·설명·h1·canonical 누락, 깨진 링크, 이미지 대체 텍스트, `TODO` 자리표시, https가 아닌 리소스, 홈 noindex, robots.txt 전체 차단 등
5. **GitHub Pages 배포**
6. **IndexNow** — 새로 생기거나 바뀐 페이지만 네이버·Bing에 즉시 알림

처음 저장소를 만드는 절차와 자체 도메인 연결: [guide/DEPLOY.md](guide/DEPLOY.md) · 네이버·구글 검색 등록: [guide/SEARCH.md](guide/SEARCH.md)

## 폴더 구조

```
site.config.mjs        사이트 주소·이름·검색엔진 소유 확인 코드·브랜드 정보 (여기만 고치면 됨)
src/                   배포되는 원본
  index.html           처음 화면
  salon/               미용실 소개(index.html, preview.js) + app/ 대시보드(salon.css, js/)
  wax/                 왁싱샵 소개(index.html, preview.js) + app/ 대시보드(app.css, js/)
  checkout/ admin/ legal/  결제 · 운영자 분석 · 약관
  app/                 예전 주소를 왁싱샵 대시보드로 넘겨 주는 페이지
  assets/              tokens.css(색·글자·버튼), site.css(마케팅), dash.css(대시보드), js/(공통 코드, promo-engine)
  favicon.*            파비콘
supabase/              결제 서버: migrations/(DB·행 단위 보안), functions/(billing·renew·portone-webhook, _shared 결제 규칙)
scripts/               빌드·검사·IndexNow·미리보기, dev-backend.mjs(가짜 로그인·결제 로컬 테스트 서버)
test/                  자동 테스트 (+ test/e2e 브라우저 점검)
guide/                 배포·검색 등록·설계·결제 설정 문서
```

`src/` 안에서 이름이 `_`로 시작하는 파일·폴더는 배포되지 않습니다. 여러 페이지가 같은 부품을 쓸 때는 `src/_partials/`에 두고 페이지에 `<!-- @include _partials/mark.html -->`라고 씁니다.

## 내 컴퓨터에서

Node.js 20 이상이 필요합니다. 설치할 외부 패키지는 없습니다.

```bash
npm run preview
```

```bash
npm test
```

```bash
npm run build && npm run check
```

`npm run preview`는 `http://localhost:4173/retenfit/` 처럼 실제와 같은 하위 경로로 띄웁니다.

결제 흐름까지 보려면 아래 명령 뒤 `http://localhost:4174/retenfit/` 를 엽니다(가짜 카카오 로그인·가짜 카드, 운영자 로그인 이름 ‘운영자’).

```bash
node scripts/dev-backend.mjs
```

브라우저 점검(`npm run test:browser`)은 Playwright가 있을 때만 실행됩니다. 이미 설치한 Edge나 Chrome을 쓰려면 `playwright-core`를 설치하고 `E2E_CHANNEL=msedge`를 지정합니다.

## 내용 고치기

- 처음 화면 문구: `src/index.html`
- 업종별 소개: `src/salon/index.html`, `src/wax/index.html`
- 검색 등록 코드·브랜드 정보·공식 채널: `site.config.mjs`
- 왁싱샵 프로모션 목록·시술 메뉴 기본값: `src/wax/app/js/catalog.js`, `src/wax/app/js/state.js`
- 미용실 시술·비용 기본값: `src/salon/app/js/core.js`

GitHub 웹사이트에서 파일을 열고 연필 아이콘으로 고친 뒤 커밋해도 자동으로 다시 배포됩니다.
