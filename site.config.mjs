// ─────────────────────────────────────────────────────────────────────────────
// RETENFIT(리텐핏) 사이트 설정
//
// 이 파일만 고치면 검색 노출에 필요한 것들이 빌드할 때 자동으로 만들어집니다.
//   · 모든 페이지: canonical 주소, Open Graph(카카오톡·SNS 공유 미리보기), lang 속성
//   · 홈 페이지: 구글·네이버 소유 확인 태그, 구조화 데이터(JSON-LD)
//   · sitemap.xml, robots.txt, 404.html, IndexNow 키 파일
//
// 빈 값('')이나 빈 배열([])로 둔 항목은 출력하지 않습니다.
// 페이지 HTML에 같은 태그를 직접 써 두었다면 그쪽이 우선입니다(덮어쓰지 않음).
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // 배포 주소. GitHub Actions에서 배포할 때는 저장소의 실제 Pages 주소
  // (커스텀 도메인을 연결했다면 그 도메인)를 자동으로 읽어서 이 값 대신 씁니다.
  // 이 값은 내 컴퓨터에서 빌드하거나 Pages를 켜기 전에만 쓰입니다.
  siteUrl: 'https://merlin-not-droid.github.io/waxfit/',

  siteName: 'RETENFIT',
  // 검색 결과에 사이트 이름으로 쓰일 수 있는 다른 표기
  alternateNames: ['리텐핏'],

  language: 'ko',
  locale: 'ko_KR',

  // 공유 미리보기 이미지. src/ 기준 경로, 1200×630 PNG·JPG 권장.
  ogImage: '/assets/og.png',

  // 모바일 브라우저 주소창 색
  themeColor: '#231a14',

  // 검색엔진 소유 확인 코드 — 발급받은 <meta> 태그의 content="..." 값만 넣으세요.
  // (태그 전체를 붙여넣어도 content 값만 골라 씁니다.)
  verification: {
    google: '', // 구글 서치 콘솔 → 속성 추가 → URL 접두어 → HTML 태그
    naver: '', //  네이버 서치어드바이저 → 사이트 등록 → HTML 태그
    bing: '', //   (선택) Bing 웹마스터 도구 → msvalidate.01
    daum: '', //   (선택) 다음 웹마스터도구 PIN 코드 → robots.txt에 기록 (자체 도메인일 때만 유효)
  },

  // 구조화 데이터(JSON-LD). 구글 검색 결과의 사이트 이름·업체 정보,
  // 네이버 검색 결과의 "연관 채널"(인스타그램·블로그 등) 표시에 쓰입니다.
  business: {
    // 오프라인 매장이 있으면 'LocalBusiness' 또는 세부 유형
    // (예: 'BeautySalon', 'HealthClub', 'SportsActivityLocation'),
    // 온라인 서비스·브랜드라면 'Organization'.
    type: 'Organization',
    name: 'RETENFIT',
    description: '', // 비워 두면 홈 페이지의 meta description을 씁니다
    logo: '/assets/logo.png', // 정사각형, 112px 이상
    image: '', // 예: '/assets/store.jpg'
    telephone: '', // 예: '+82-2-1234-5678'
    email: '',
    priceRange: '', // 예: '₩₩'
    address: {
      streetAddress: '', // 예: '테헤란로 123, 4층'
      addressLocality: '', // 예: '강남구'
      addressRegion: '', // 예: '서울특별시'
      postalCode: '',
      addressCountry: 'KR',
    },
    geo: { latitude: '', longitude: '' },
    // 예: [{ days: ['월', '화', '수', '목', '금'], opens: '10:00', closes: '21:00' },
    //      { days: ['토'], opens: '10:00', closes: '18:00' }]
    openingHours: [],
    // 공식 채널 주소 (인스타그램, 네이버 블로그, 카카오톡 채널, 네이버 플레이스 등)
    sameAs: [],
  },

  // (선택) 방문 통계
  analytics: {
    ga4: '', //   Google Analytics 4 측정 ID (예: 'G-ABC123XYZ')
    naver: '', // 네이버 애널리틱스 사이트 ID
  },

  // 배포할 때 새로 생기거나 바뀐 페이지 주소를 네이버·Bing에 즉시 알립니다 (IndexNow).
  // 구글은 IndexNow를 쓰지 않으므로 서치 콘솔에 제출한 sitemap.xml로 수집합니다.
  indexNow: {
    enabled: true,
    // 공개되어도 되는 값입니다 (사이트에 <키>.txt 파일로 게시되어 소유 확인에 쓰임).
    key: '643799797db15f63437f7302a484b099',
    endpoints: ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow'],
  },
};
