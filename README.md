# WAXFIT (왁스핏)

[![사이트 배포](https://github.com/merlin-not-droid/waxfit/actions/workflows/deploy.yml/badge.svg)](https://github.com/merlin-not-droid/waxfit/actions/workflows/deploy.yml)

**사이트: <https://merlin-not-droid.github.io/waxfit/>** · 데모 앱: <https://merlin-not-droid.github.io/waxfit/app/>

왁싱샵 사장님을 위한 **첫 방문 유인 · 재방문 설계 · 성과 분석** 도구입니다.
GitHub에 올리면 자동으로 검사한 뒤 GitHub Pages로 배포하고, 네이버·구글이 찾을 수 있도록 검색 등록에 필요한 것들을 자동으로 만들어 줍니다.

| 주소 | 내용 | 검색 노출 |
|---|---|---|
| `/` | 소개(랜딩) 페이지 — 기능·요금·자주 묻는 질문·문의 | ✅ 대상 |
| `/app/` | 데모 앱 — 첫 방문 유인, 재방문 설계, 성과 분석, 고객 데이터, 매장 설정 | ❌ 제외(noindex) |

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
  app/                 데모 앱 (index.html, app.css, js/)
  assets/              CSS·이미지(og.png 공유 이미지, logo.png)
  favicon.*            파비콘
scripts/               빌드·검사·IndexNow·미리보기 (외부 패키지 없음)
test/                  자동 테스트 (+ test/e2e 브라우저 점검)
guide/                 배포·검색 등록·설계 문서
```

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

## 내용 고치기

- 소개 문구: `src/index.html`
- 문의 채널(카카오톡 채널·이메일 등): `src/index.html`의 `#contact` 영역 주석 예시를 참고해 버튼 추가
- 검색 등록 코드·브랜드 정보·공식 채널: `site.config.mjs`
- 앱의 프로모션 목록: `src/app/js/catalog.js`, 시술 메뉴 기본값: `src/app/js/state.js`

GitHub 웹사이트에서 파일을 열고 연필 아이콘으로 고친 뒤 커밋해도 자동으로 다시 배포됩니다.
