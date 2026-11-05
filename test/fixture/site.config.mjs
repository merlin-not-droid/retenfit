// 테스트 전용 가상 사이트 설정 (실제 업체 정보가 아닙니다)
export default {
  siteUrl: 'https://example-user.github.io/demo/',
  siteName: 'Demo Studio',
  alternateNames: ['데모 스튜디오'],
  language: 'ko',
  locale: 'ko_KR',
  ogImage: '/assets/og.png',
  themeColor: '#123456',
  verification: {
    // 메타 태그 전체를 붙여넣은 경우도 처리되는지 확인
    google: '<meta name="google-site-verification" content="g00gleCode_-123" />',
    naver: 'abcdef0123456789',
    bing: '',
    daum: 'DaumWebMasterTool:aaaabbbbccccdddd:XyZ==',
  },
  business: {
    type: 'LocalBusiness',
    name: 'Demo Studio',
    telephone: '+82-2-000-0000',
    address: {
      streetAddress: '테스트로 1',
      addressLocality: '중구',
      addressRegion: '서울특별시',
      postalCode: '04500',
    },
    geo: { latitude: '37.5', longitude: '126.9' },
    openingHours: [
      { days: ['금', '월', '화', '수', '목'], opens: '10:00', closes: '21:00' },
      { days: ['Sa'], opens: '9:00', closes: '18:00' },
    ],
    sameAs: ['https://www.instagram.com/demo-studio-test'],
  },
  analytics: { ga4: 'G-TEST1234', naver: 'abc123def' },
  indexNow: {
    enabled: true,
    key: '0123456789abcdef0123456789abcdef',
    endpoints: ['https://example.invalid/indexnow'],
  },
};
