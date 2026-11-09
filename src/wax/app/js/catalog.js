// 프로모션 목록 — 사장님이 고르는 선택지
//
// recommended / range : 할인율(0~1). 일반적으로 쓰이는 출발점이며,
// 실제 추천값은 매장 숫자(정가·변동비·최소 이익·재방문율)로 계산한 한도를 넘지 않게 낮춰집니다.
// (economics.js → recommendDiscount)

export const ACQUISITION = [
  {
    id: 'first-rate',
    name: '첫 방문 할인',
    summary: '처음 오는 손님에게 정해진 비율만큼 할인합니다.',
    recommended: 0.2,
    range: [0.1, 0.3],
    tip: '가장 단순하고 효과가 바로 보이지만, 할인만 보고 오는 손님이 섞이기 쉽습니다. 재방문 혜택과 함께 쓰세요.',
  },
  {
    id: 'first-booking',
    name: '다음 방문 예약 시 첫 방문 할인',
    summary: '첫 시술 날 다음 방문을 예약하면 첫 방문 금액을 할인합니다.',
    recommended: 0.15,
    range: [0.1, 0.25],
    tip: '재방문 약속을 첫 방문에 묶는 방식입니다. 예약 부도에 대비해 변경 규정을 함께 안내하세요.',
  },
  {
    id: 'first-friend',
    name: '지인과 함께 방문 할인',
    summary: '지인과 함께 오면 두 사람 모두 할인합니다.',
    recommended: 0.15,
    range: [0.1, 0.2],
    tip: '한 번에 두 명의 신규 손님을 만들 수 있습니다. 두 사람의 다음 방문 주기를 함께 관리하세요.',
  },
  {
    id: 'first-addon',
    name: '첫 방문 부위 추가 할인',
    summary: '주 시술과 함께 받는 추가 부위를 할인합니다.',
    recommended: 0.3,
    range: [0.2, 0.5],
    tip: '할인은 추가 부위에만 적용되므로 주 시술 이익은 지킬 수 있습니다. 계산은 추가 부위 가격 기준입니다.',
  },
];

export const RETENTION = [
  {
    id: 'cycle-remind',
    name: '방문 주기 맞춤 안내',
    summary: '다음 방문 예정일 며칠 전에 안내합니다. 할인 없이도 효과를 볼 수 있습니다.',
    recommended: 0,
    range: [0, 0],
    tip: '수신 동의한 손님에게만 보낼 수 있습니다. 안내 문구에 (광고) 표시와 수신 거부 방법이 들어갑니다.',
  },
  {
    id: 'second-visit',
    name: '주기 안 재방문 할인',
    summary: '방문 주기 안에 다시 오면 할인합니다.',
    recommended: 0.1,
    range: [0.05, 0.2],
    tip: '첫 방문 후 두 번째 방문이 단골이 되는 갈림길입니다. 기한(예: 첫 방문 후 6주)을 분명히 정하세요.',
  },
  {
    id: 'package',
    name: '회수권 (선결제)',
    summary: '여러 회를 미리 결제하면 회당 금액을 낮춰 줍니다.',
    recommended: 0.15,
    range: [0.1, 0.25],
    tip: '재방문이 확정되는 대신 미사용 회차 환불 기준을 결제 전에 꼭 안내하세요.',
  },
  {
    id: 'stamp',
    name: '스탬프 적립',
    summary: '정해진 횟수만큼 오면 한 번 무료 또는 할인합니다.',
    recommended: 0.17,
    range: [0.1, 0.2],
    tip: '예: 5회 방문 시 1회 무료 ≈ 회당 약 17% 할인과 같습니다.',
  },
  {
    id: 'winback',
    name: '오래 안 온 손님 복귀 쿠폰',
    summary: '방문 주기의 두 배가 지나도록 오지 않은 손님에게 쿠폰을 보냅니다.',
    recommended: 0.15,
    range: [0.1, 0.25],
    tip: '이미 떠난 손님을 다시 부르는 비용입니다. 신규 손님 유치 비용과 비교해 정하세요.',
  },
  {
    id: 'review',
    name: '후기 작성 시 다음 방문 할인',
    summary: '후기를 남긴 손님에게 다음 방문 할인을 줍니다.',
    recommended: 0.1,
    range: [0.05, 0.15],
    tip: '혜택을 받고 쓴 후기임을 후기에 밝히도록 안내해야 합니다(추천·보증 표시 기준).',
  },
];

export const findPromotion = (id) => [...ACQUISITION, ...RETENTION].find((p) => p.id === id);
