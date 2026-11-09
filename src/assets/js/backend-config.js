// 결제·로그인 서버 연결 설정 — 공개해도 되는 값만 넣습니다.
// 비밀 키(PortOne API Secret, 카카오 Client Secret, Supabase service role 키)는 절대 넣지 마세요 → Supabase Secrets·대시보드
//
//   mode 'off'      : 결제 오픈 전(기본값). 결제 페이지는 요금과 안내만 보여 주고 결제 버튼을 막습니다.
//   mode 'supabase' : 운영. 카카오 로그인(Supabase Auth) + PortOne 정기결제
//   mode 'dev'      : 로컬 테스트 서버(scripts/dev-backend.mjs)가 이 파일 대신 자동으로 넣어 줍니다.
// 설정 순서는 guide/BILLING.md 를 보세요.
export default {
  mode: 'off',
  supabaseUrl: 'https://sesmjyfoazxdhokntght.supabase.co',
  // 공개 키(publishable). 브라우저에 공개되도록 만들어진 키라 여기에 둡니다. secret 키(sb_secret_…)는 절대 넣지 않습니다.
  supabaseAnonKey: 'sb_publishable_fEGEhBEH5WA8hlkPptD-1w_XQwuHdQ-',
  portone: {
    storeId: '', // PortOne 콘솔 → 상점 ID (store-...)
    channelKey: '', // PortOne 콘솔 → 결제 연동 → 정기결제(빌링키) 채널 키 (channel-key-...)
  },
};
