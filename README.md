# WAXFIT (왁스핏)

[![사이트 배포](https://github.com/merlin-not-droid/waxfit/actions/workflows/deploy.yml/badge.svg)](https://github.com/merlin-not-droid/waxfit/actions/workflows/deploy.yml)

**사이트: <https://merlin-not-droid.github.io/waxfit/>** · 결제 페이지: <https://merlin-not-droid.github.io/waxfit/checkout/>

**첫 방문 고객을 단골로 만드는 가장 쉬운 방법.** 왁스핏이 고객의 재방문 시점을 분석하고, 다시 방문하도록 만드는 프로모션을 추천합니다.
요금: 첫 3개월 월 4,900원 → 4개월째부터 월 8,900원(부가세 포함), 카카오 로그인 + 카드 정기결제. 설정: [guide/BILLING.md](guide/BILLING.md)
GitHub에 올리면 자동으로 검사한 뒤 GitHub Pages로 배포하고, 네이버·구글이 찾을 수 있도록 검색 등록에 필요한 것들을 자동으로 만들어 줍니다.

| 주소 | 내용 | 검색 노출 |
|---|---|---|
| `/` | 소개(랜딩) 페이지 — 핵심 문구·기능·요금 → 결제 페이지로 안내 | ✅ 대상 |
| `/checkout/` | 결제 — 카카오 로그인 → 동의 → 카드 등록·첫 달 결제, 내 구독(해지·해지 취소) | ❌ 제외(noindex) |
| `/app/` | 구독자 앱 — 이번 달 추천, 첫 방문 유인, 재방문 설계, 성과 분석, 효과 실험, 고객 데이터, 매장 설정 | ❌ 제외(noindex) |
| `/admin/` | 운영자 분석 — 운영자 계정만 데이터 조회(서버 행 단위 보안) | ❌ 제외(noindex) |
| `/legal/` | 이용약관·정기결제·환불·개인정보(초안) | ✅ 대상 |

결제 서버를 연결하기 전(`src/assets/js/backend-config.js`의 `mode: 'off'`)에는 결제 페이지가 요금만 보여 주고 결제 버튼을 막으며, 앱은 지금처럼 바로 열립니다.

> 기존 ChatGPT 사이트(`*.chatgpt.site`)는 ChatGPT 로그인 화면(HTTP 401) 뒤에 있어 **검색로봇이 내용을 전혀 볼 수 없습니다.**
> 이 저장소는 그 설계를 바탕으로 다시 구현하고, 공개 소개 페이지와 앱을 분리했습니다. 자세한 이유와 바뀐 점은 [guide/DESIGN.md](guide/DESIGN.md).

## 처음 배포하기 (3단계)

1. GitHub에서 **Public** 저장소를 만들고(예: `waxfit`) 이 폴더를 올립니다.
2. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿉니다.
3. **Actions** 탭에서 ‘사이트 배포’가 초록색이 되면 `https://<아이디>.github.io/waxfit/` 에서 열립니다.

자세한 절차, 자체 도메인 연결: [guide/DEPLOY.md](guide/DEPLOY.md)
네이버·구글 검색 등록: [guide/SEARCH.md](guide/SEARCH.md)

## 자동으로 해 주는 일

`main`에 push 할 때마다 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)이 실행됩니다.

1. **테스트** — 빌드 도구와 앱 계산 로직 (`npm test`)
2. **Pages 설정 확인** — 꺼져 있거나 ‘Deploy from a branch’면 배포를 건너뛰고 무엇을 눌러야 하는지 안내
3. **빌드** (`src/` → `dist/`)
   - 모든 페이지: canonical 주소, Open Graph(카카오톡·SNS 미리보기), `lang="ko"`, 파비콘
   - 홈: 구글·네이버 소유 확인 태그, 구조화 데이터(JSON-LD: 사이트 이름·브랜드·공식 채널)
   - `sitemap.xml`(페이지별 마지막 수정 시각 = 커밋 시각), `robots.txt`, `404.html`
   - 하위 경로(`/waxfit/`) 배포 시 `/about/` 같은 링크를 자동 보정
4. **배포 전 검사** (`npm run check`) — 오류가 있으면 배포하지 않음
   - 제목·설명·h1·canonical 누락, 깨진 링크, 이미지 대체 텍스트, `TODO` 자리표시, https가 아닌 리소스, 홈 noindex, robots.txt 전체 차단 등
5. **GitHub Pages 배포**
6. **IndexNow** — 새로 생기거나 바뀐 페이지만 네이버·Bing에 즉시 알림

## 폴더 구조

```
site.config.mjs        사이트 주소·이름·검색엔진 소유 확인 코드·브랜드 정보 (여기만 고치면 됨)
src/                   배포되는 원본
  index.html           소개 페이지
  checkout/ admin/ legal/  결제 · 운영자 분석 · 약관
  app/                 구독자 앱 (index.html, app.css, js/)
  assets/              CSS·이미지, js/(결제 연결 backend.js·설정 backend-config.js·결제 규칙 billing-core.js)
  favicon.*            파비콘
supabase/              결제 서버: migrations/(DB·행 단위 보안), functions/(billing·renew·portone-webhook, _shared 결제 규칙)
scripts/               빌드·검사·IndexNow·미리보기, dev-backend.mjs(가짜 로그인·결제 로컬 테스트 서버)
test/                  자동 테스트 (+ test/e2e 브라우저 점검)
guide/                 배포·검색 등록·설계·결제 설정(BILLING.md) 문서
```

로컬에서 결제 흐름까지 보려면 `node scripts/dev-backend.mjs` → `http://localhost:4174/waxfit/` (가짜 카카오 로그인·가짜 카드, 운영자 로그인 이름 ‘운영자’).

`src/` 안에서 이름이 `_`로 시작하는 파일·폴더는 배포되지 않습니다. 여러 페이지가 같은 머리말을 쓸 때는 `src/_partials/header.html`을 만들고 페이지에 `<!-- @include _partials/header.html -->`라고 쓰면 됩니다.

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

`npm run preview`는 `http://localhost:4173/waxfit/` 처럼 실제와 같은 하위 경로로 띄웁니다.
브라우저 점검(`npm run test:browser`)은 Playwright가 설치되어 있을 때만 실행됩니다.

## 이번 달 추천 (매장별 추천 엔진)

앱의 첫 화면입니다. 방문 기록과 **매장 설정 → 매장 진단**(상권·가격대·예약률·예산 등)으로 매장마다 다른 프로모션을 고릅니다.

1. 어디서 이익이 새는지(첫 방문 유인 · 첫 재방문 전환 · 단골 만들기 · 유지) 비중을 계산
2. 손님을 막는 심리 장벽 14가지의 강도를 근거와 함께 계산
3. 장치 36가지를 장벽·상권·계절·손익에 맞춰 평가하고, 예산·일손 안에서 이번 달 플랜 2~4개를 고름
4. 혜택은 손익 한도 안에서 '이익 차이가 작으면 더 낮은 혜택'을 첫 시험값으로 제안 → 첫 방문 유인·재방문 설계 화면의 할인 스펙트럼 시작값과 ‘AI 순위’ 배지로 연결

- 연결 코드: `src/app/js/recommend.js`(앱 데이터 → 엔진), `src/app/js/views/recommend.js`(화면)
- 엔진: `src/app/js/promo-engine/`는 별도 프로젝트 **promo-engine**(TypeScript 원본, 설계 문서 `docs/DESIGN.md`)에서 만든 브라우저용 파일입니다. **직접 고치지 말고** 원본을 고친 뒤 다시 만듭니다.

  ```bash
  node ../promo-engine/scripts/build-browser.mjs src/app/js/promo-engine
  ```

- 효과 수치는 초기 가정값입니다. 화면에 근거 수준(사전 가정 / 유사 매장 / 우리 매장)을 함께 표시합니다.

## 효과 실험 (비교군)

혜택을 받은 손님과 **받지 않은 손님(비교군)**을 같은 기간에 비교해 ‘프로모션이 없었어도 왔을 손님’을 빼고 효과를 잽니다. 결과는 이번 달 추천 계산에 바로 반영됩니다(우리 매장 결과가 쌓일수록 비중이 커짐).

| 방식 | 대상 프로모션 | 하는 일 |
|---|---|---|
| 격주 교차 | 첫 방문 유인(신규) | 한 주 시행, 한 주 쉼 → 주간 신규 손님 수 비교 |
| 비교군(결제 때) | 주기 안 재방문 할인·스탬프·후기 등 | 처음 온 손님을 손님 번호로 자동 배정, 비교군에게는 혜택 없이 |
| 비교군(안내 발송) | 주기 안내·복귀 쿠폰 등 | 재방문 설계에서 목록을 복사할 때 비교군은 빠지고 양쪽 모두 기록 |

- 시작: ‘이번 달 추천’ 카드의 **비교군 실험으로 시작**, 또는 ‘효과 실험’ 화면에서 저장한 프로모션 선택
- 계산: `src/app/js/experiments.js`, 화면: `src/app/js/views/experiments.js`, 데이터: 앱 상태의 `experiments`(이 기기에만 저장, 백업 파일에 포함)

## 내용 고치기

- 소개 문구: `src/index.html`
- 문의 채널(카카오톡 채널·이메일 등): `src/index.html`의 `#contact` 영역 주석 예시를 참고해 버튼 추가
- 검색 등록 코드·브랜드 정보·공식 채널: `site.config.mjs`
- 앱의 프로모션 목록: `src/app/js/catalog.js`, 시술 메뉴 기본값: `src/app/js/state.js`

GitHub 웹사이트에서 파일을 열고 연필 아이콘으로 고친 뒤 커밋해도 자동으로 다시 배포됩니다.
