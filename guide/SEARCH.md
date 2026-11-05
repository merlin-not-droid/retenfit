# 네이버·구글에서 검색되게 하기

사이트를 배포하는 것만으로는 검색에 바로 나오지 않습니다. 검색엔진에 **“이 사이트가 내 것이고, 이런 페이지들이 있다”** 고 알려야 합니다.
이 저장소는 그 준비물(소유 확인 태그, sitemap.xml, robots.txt, 구조화 데이터, IndexNow)을 자동으로 만들고, 사람이 할 일은 각 검색엔진에 등록하고 코드 두 줄을 붙여넣는 것뿐입니다.

> **먼저 알아둘 점**
> - 등록해도 노출은 **보장되지 않으며**, 보통 며칠~몇 주가 걸립니다. 새 사이트는 ‘WAXFIT’, ‘왁스핏’ 같은 브랜드 이름 검색부터 잡힙니다.
> - 기존 `*.chatgpt.site` 주소는 로그인 화면(401) 뒤에 있어 검색로봇이 볼 수 없었습니다. 이제는 공개 소개 페이지(`/`)가 검색 대상이고, 손님 기록을 다루는 앱(`/app/`)은 일부러 검색에서 뺐습니다(noindex).
> - 가능하면 **자체 도메인을 먼저 연결한 뒤** 등록하세요([DEPLOY.md 4단계](DEPLOY.md#4-자체-도메인-연결-권장)). 주소가 바뀌면 등록을 다시 해야 합니다.

---

## 1단계. 구글 서치 콘솔

1. <https://search.google.com/search-console> 접속 → **속성 추가**
   - 자체 도메인이 있으면 **도메인** 속성(DNS TXT 인증)이 가장 확실합니다. 이 경우 3번의 HTML 태그는 필요 없습니다.
   - `github.io` 주소라면 **URL 접두어** 에 배포 주소 전체(예: `https://<아이디>.github.io/waxfit/`) 입력
2. 확인 방법에서 **HTML 태그** 선택 → `<meta name="google-site-verification" content="……">` 의 **content 값**을 복사
3. `site.config.mjs` 에 붙여넣고 커밋·push

   ```js
   verification: {
     google: '복사한-값',
   ```

   (태그 전체를 붙여넣어도 content 값만 골라 씁니다.)
4. Actions에서 배포가 끝나면 서치 콘솔에서 **확인** 클릭
5. 왼쪽 메뉴 **Sitemaps** → `sitemap.xml` 제출 (주소 전체: `https://…/waxfit/sitemap.xml`)
6. 상단 **URL 검사** 에 홈 주소 입력 → **색인 생성 요청**

구글은 IndexNow를 쓰지 않으므로, 이후에는 제출한 sitemap.xml을 주기적으로 읽어 새 페이지를 찾습니다.

## 2단계. 네이버 서치어드바이저

1. <https://searchadvisor.naver.com> 접속 → 네이버 아이디로 로그인 → **웹마스터 도구**
2. **사이트 등록** 에 배포 주소 입력
   - 자체 도메인: `https://waxfit.kr`
   - `github.io` 하위 경로 주소는 네이버에서 등록이 거절되거나 소유 확인이 안 될 수 있습니다. 그럴 때는 자체 도메인을 연결하거나, 저장소 이름을 `<아이디>.github.io` 로 바꿔 루트 주소로 배포하세요.
3. 소유 확인 방법에서 **HTML 태그** 선택 → `naver-site-verification` 의 **content 값** 복사
4. `site.config.mjs` 의 `verification.naver` 에 붙여넣고 커밋·push → 배포 후 **소유확인** 클릭
5. 등록된 사이트를 눌러 들어가서
   - **요청 → 사이트맵 제출**: `sitemap.xml` 주소 제출
   - **요청 → 웹 페이지 수집**: 홈 주소 입력
   - **검증 → robots.txt**: 수집 허용 확인 (자체 도메인일 때)
   - **검증 → 웹 페이지 최적화**: 제목·설명·Open Graph 점검 (빌드가 자동으로 넣습니다)
6. 배포할 때마다 **IndexNow** 로 바뀐 페이지를 네이버에 자동으로 알립니다(설정 불필요). Actions의 ‘검색엔진 변경 알림’ 단계에서 결과를 볼 수 있습니다.
   - 공용 창구(`api.indexnow.org`)가 받은 알림은 네이버를 포함한 참여 검색엔진에 공유됩니다.
   - 네이버 직접 창구(`searchadvisor.naver.com/indexnow`)가 **HTTP 422·403** 경고를 내면, 서치어드바이저 사이트 등록·소유확인 전이거나 `github.io` 하위 경로 주소라서 거절된 것일 수 있습니다. 첫 배포 때 실제로 422가 나왔습니다. 등록(또는 자체 도메인 연결) 뒤 다음 배포 때 자동으로 다시 시도합니다.

## 3단계. 브랜드 검색 강화 (네이버에서 특히 중요)

네이버 검색 결과는 네이버 블로그·카페 같은 자체 서비스 글을 많이 보여 줍니다. 사이트 등록과 함께 아래를 해 두면 ‘왁스핏’ 검색 때 찾기 쉬워집니다.

1. **공식 채널 만들기**: 네이버 블로그, 인스타그램, 카카오톡 채널 등
2. `site.config.mjs` 의 `business.sameAs` 에 채널 주소를 넣기 → 구조화 데이터로 출력되어 네이버 검색 결과의 ‘연관 채널’, 구글의 브랜드 정보에 쓰일 수 있습니다.

   ```js
   sameAs: [
     'https://blog.naver.com/…',
     'https://www.instagram.com/…',
     'https://pf.kakao.com/…',
   ],
   ```

3. **사장님들이 실제로 검색할 말**로 글 쓰기: 예) ‘왁싱샵 재방문율 높이는 법’, ‘왁싱샵 첫 방문 할인 얼마가 적당할까’, ‘왁싱샵 고객 관리 엑셀’. 블로그 글에서 사이트로 링크하세요.
4. 소개 페이지에 **문의 채널**을 꼭 넣으세요(`src/index.html` 의 `#contact`). 검색으로 들어온 사장님이 연락할 곳이 있어야 합니다. 지금은 비어 있어 배포 전 검사가 경고를 냅니다.

> 참고: 네이버 스마트플레이스·구글 비즈니스 프로필은 손님이 찾아오는 **오프라인 매장용**입니다. WAXFIT은 온라인 서비스라 해당되지 않습니다(사무실을 열어 방문 상담을 한다면 그때 등록).

## 4단계(선택). Bing·다음

- **Bing 웹마스터 도구** <https://www.bing.com/webmasters>: 구글 서치 콘솔에서 가져오기로 바로 등록됩니다. HTML 태그 방식을 쓰면 `verification.bing` 에 `msvalidate.01` 값을 넣으세요.
- **다음 웹마스터도구** <https://webmaster.daum.net>: 받은 PIN 코드를 `verification.daum` 에 넣으면 robots.txt에 기록됩니다. robots.txt는 도메인 최상위에서만 읽히므로 **자체 도메인일 때만** 동작합니다.

## 잘 되고 있는지 확인하기

| 확인할 것 | 방법 |
|---|---|
| 구글 색인 여부 | 구글에서 `site:waxfit.kr` (또는 `site:<아이디>.github.io/waxfit`) 검색, 서치 콘솔 **페이지** 보고서 |
| 네이버 수집 여부 | 서치어드바이저 **리포트 → 사이트 현황·수집 현황** |
| 공유 미리보기 | 카카오톡에 주소를 보내 보기 (캐시 초기화: [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing)) |
| 구조화 데이터 | [리치 결과 테스트](https://search.google.com/test/rich-results) 에 주소 입력 |
| 모바일·속도 | [PageSpeed Insights](https://pagespeed.web.dev) |

## 이 저장소가 자동으로 해 주는 것 (참고)

| 항목 | 위치 | 설명 |
|---|---|---|
| `<title>`·설명 검사 | 배포 전 검사 | 없거나 너무 길면 오류·경고 |
| canonical | 모든 페이지 | 같은 내용의 여러 주소를 하나로 모음 |
| Open Graph | 모든 페이지 | 카카오톡·SNS 공유 미리보기 (`assets/og.png`) |
| 소유 확인 태그 | 홈 | `site.config.mjs` 의 코드 |
| 구조화 데이터 | 홈 | WebSite(사이트 이름·‘왁스핏’), Organization(로고·공식 채널), SoftwareApplication |
| sitemap.xml | 사이트 루트 | 검색 대상 페이지만, 마지막 수정 시각 포함 |
| robots.txt | 사이트 루트 | 전체 수집 허용 + sitemap 위치 |
| noindex | `/app/`, `404.html` | 손님 기록 화면·오류 페이지는 검색 제외 |
| IndexNow | 배포 후 | 새로 생기거나 바뀐 페이지만 네이버·Bing에 알림 |
