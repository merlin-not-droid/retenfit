// 운영자 전용 분석: 구독·결제·체험가 전환·매장 지표·매장 간 실험 합산
// 데이터 보호는 서버가 합니다(Supabase 행 단위 보안: 운영자 계정만 전체 행을 받음). 이 화면은 받은 데이터를 보여 주기만 합니다.
import { CATALOG_BY_ID } from '../../app/js/promo-engine/index.js';
import { backend, loginErrorMessage } from './backend.js';
import { PRICING, STATUS_LABEL, adminSummary, chargeAmount, todayKST } from './billing-core.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const won = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '–');
const pct = (r, d = 0) => (Number.isFinite(r) ? `${(r * 100).toFixed(d)}%` : '–');
const pp = (r) => (Number.isFinite(r) ? `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}%p` : '–');
const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '–');
const shop = (p) => esc(p?.shopName || p?.nickname || '(이름 없음)');
const CHECKOUT_URL = new URL('../checkout/', location.href).href;

function table(head, rows, empty = '없습니다.') {
  if (!rows.length) return `<p class="muted">${empty}</p>`;
  return `<div class="table-scroll"><table class="data-table"><thead><tr>${head.map((h) => `<th scope="col"${h.num ? ' class="num"' : ''}>${h.label ?? h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${head[i]?.num ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function revenueChart(monthly) {
  const W = 720;
  const H = 200;
  const max = Math.max(1, ...monthly.map((m) => m.revenue));
  const bw = W / monthly.length;
  const bars = monthly.map((m, i) => {
    const h = Math.round((m.revenue / max) * (H - 50));
    const x = i * bw + bw * 0.2;
    return `<rect class="bar" x="${x.toFixed(1)}" y="${H - 24 - h}" width="${(bw * 0.6).toFixed(1)}" height="${h}" rx="3"><title>${m.month} ${won(m.revenue)}</title></rect>
      <text x="${(x + bw * 0.3).toFixed(1)}" y="${H - 6}" text-anchor="middle">${Number(m.month.slice(5))}월</text>
      ${m.revenue ? `<text x="${(x + bw * 0.3).toFixed(1)}" y="${H - 30 - h}" text-anchor="middle">${Math.round(m.revenue / 1000).toLocaleString('ko-KR')}천</text>` : ''}`;
  });
  return `<svg class="bar-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 12개월 결제액">${bars.join('')}</svg>`;
}

function noticeText(s) {
  const d = s.nextChargeOn;
  return `[WAXFIT] ${s.profile?.shopName || '사장님'} 사장님, 체험가(월 ${PRICING.introPrice.toLocaleString('ko-KR')}원) 3개월이 끝나 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일부터 월 ${PRICING.regularPrice.toLocaleString('ko-KR')}원(부가세 포함)으로 결제됩니다. 계속 쓰지 않으시려면 그 전에 ‘내 구독’에서 해지해 주세요. ${CHECKOUT_URL}`;
}

function csv(rows) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // 엑셀 수식 주입 방지
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\n')}`;
}

function download(name, text) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

function render(root, sum, data) {
  const b = sum.byStatus;
  const deviceName = (id) => esc(CATALOG_BY_ID[id]?.name ?? id);
  const paidBy = new Map();
  for (const p of data.payments) if (p.status === 'paid') paidBy.set(p.userId, (paidBy.get(p.userId) ?? 0) + p.amount);
  const avg = (key) => {
    const v = sum.stores.map((s) => s.data?.[key]).filter(Number.isFinite);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN;
  };

  root.innerHTML = `
  <p class="muted">기준일 ${esc(sum.today)} · 구독 계정 ${sum.subscribers}개</p>
  <div class="kpi-grid">
    <div class="kpi"><span>이용 중인 매장</span><b>${sum.live}곳</b><small>체험가 ${b.trial} · 정가 ${b.active} · 결제 실패 ${b.past_due}</small></div>
    <div class="kpi"><span>월 반복 매출(MRR)</span><b>${won(sum.mrr)}</b><small>이용 중 매장의 다음 결제 금액 합</small></div>
    <div class="kpi"><span>이번 달 결제액</span><b>${won(sum.revenueThisMonth)}</b><small>누적 ${won(sum.revenueTotal)} · 실패 ${sum.failedThisMonth}건</small></div>
    <div class="kpi"><span>체험가 → 정가 전환율</span><b>${pct(sum.conversion.rate)}</b><small>3개월 지난 ${sum.conversion.reached}곳 중 ${sum.conversion.converted}곳</small></div>
    <div class="kpi"><span>이번 달 해지율</span><b>${pct(sum.churnThisMonth, 1)}</b><small>해지 예약 ${b.canceled} · 종료 ${b.ended}</small></div>
  </div>

  <section class="card"><h2>최근 12개월</h2>${revenueChart(sum.monthly)}
    ${table(['월', { label: '신규 가입', num: 1 }, { label: '해지', num: 1 }, { label: '결제액', num: 1 }],
      sum.monthly.slice(-6).reverse().map((m) => [m.month, m.signups, m.cancels, won(m.revenue)]))}</section>

  <section class="card"><h2>정가 전환 안내 대상 (7일 이내)</h2>
    <p class="muted">가입 때 동의받은 대로 4개월째부터 월 ${PRICING.regularPrice.toLocaleString('ko-KR')}원으로 바뀝니다. 바뀌기 7일 전까지 금액·날짜·해지 방법을 알려 주세요.</p>
    ${table(['매장', '연락처', '전환일', { label: '금액', num: 1 }, ''], sum.notices.map((s) => [
      shop(s.profile), esc([s.profile?.phone, s.profile?.email].filter(Boolean).join(' · ')), esc(s.nextChargeOn), won(PRICING.regularPrice),
      `<button type="button" class="link-btn" data-copy="${esc(s.userId)}">안내 문구 복사</button>`]), '이번 주에 정가로 바뀌는 매장이 없습니다.')}</section>

  <section class="card"><h2>결제 실패 · 재시도 중</h2>
    ${table(['매장', '연락처', '실패 횟수', '다음 재시도'], sum.pastDue.map((s) => [shop(s.profile), esc(s.profile?.phone ?? ''), `${s.failedCount}회`, esc(s.nextChargeOn)]))}</section>

  <section class="card"><h2>구독 매장 지표</h2>
    <p class="muted">앱이 하루 한 번 보내는 매장 집계 숫자입니다(손님 개인정보 없음).</p>
    ${table(['매장', '상태', '상권', { label: '손님', num: 1 }, { label: '월 신규', num: 1 }, { label: '첫 재방문율', num: 1 }, { label: '활성 단골', num: 1 }, { label: '실험', num: 1 }, '동기화'],
      sum.stores.map((s) => [shop(s.profile ?? { shopName: s.data?.shopName }), s.subscription ? `<span class="pill ${s.subscription.status}">${esc(STATUS_LABEL[s.subscription.status])}</span>` : '–',
        esc(s.data?.tradeAreaLabel ?? ''), s.data?.customers ?? '–', s.data?.newPerMonth?.toFixed?.(1) ?? '–', pct(s.data?.secondVisitRate), s.data?.activeRegulars ?? '–',
        s.data?.experiments?.length ?? 0, md(s.syncedOn)]), '아직 매장 지표가 올라오지 않았습니다.')}
    ${sum.stores.length ? `<p class="muted">평균 첫 재방문율 ${pct(avg('secondVisitRate'))} · 평균 월 신규 ${Number.isFinite(avg('newPerMonth')) ? avg('newPerMonth').toFixed(1) : '–'}명</p>` : ''}</section>

  <section class="card"><h2>매장 간 실험 합산 (비슷한 매장 학습 데이터)</h2>
    <p class="muted">각 매장의 ‘효과 실험’ 결과를 장치별로 합쳤습니다. 매장 한 곳으로는 판단이 어려운 효과도 합치면 빨리 보입니다.</p>
    ${table(['프로모션', { label: '매장', num: 1 }, { label: '혜택군', num: 1 }, { label: '비교군', num: 1 }, { label: '차이', num: 1 }, '95% 구간'],
      sum.pooled.map((p) => [deviceName(p.promotionId), p.stores, `${pct(p.pt)} (${p.treated}명)`, `${pct(p.pc)} (${p.control}명)`, pp(p.diff), `${pp(p.ci[0])} ~ ${pp(p.ci[1])}`]), '아직 합칠 실험 결과가 없습니다.')}</section>

  <section class="card"><h2>최근 결제</h2>
    ${table(['날짜', '매장', '회차', { label: '금액', num: 1 }, '상태'], sum.recentPayments.map((p) => [esc(p.paidOn), shop(p.profile), `${p.chargeIndex + 1}회차`, won(p.amount),
      p.status === 'paid' ? '완료' : esc(`${p.status === 'failed' ? '실패' : '취소'}${p.failure ? ` · ${p.failure}` : ''}`)]))}</section>

  <section class="card"><h2>내려받기</h2>
    <div class="cta-row">
      <button type="button" class="btn btn-line" data-csv="subscribers">구독자 CSV</button>
      <button type="button" class="btn btn-line" data-csv="payments">결제 CSV</button>
      <button type="button" class="btn btn-line" data-csv="stores">매장 지표 CSV</button>
    </div>
    <p class="muted">구독자 연락처가 들어 있으니 안전한 곳에만 보관하세요.</p></section>`;

  const profileOf = new Map(data.profiles.map((p) => [p.userId, p]));
  root.querySelectorAll('[data-copy]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const s = sum.notices.find((x) => x.userId === btn.dataset.copy);
      await navigator.clipboard.writeText(noticeText(s)).then(() => (btn.textContent = '복사했습니다'), () => (btn.textContent = '복사 실패'));
    }),
  );
  const files = {
    subscribers: () => [['매장', '닉네임', '이메일', '휴대폰', '상태', '가입일', '결제 횟수', '다음 결제일', '다음 금액', '누적 결제액'],
      ...data.subscriptions.map((s) => {
        const p = profileOf.get(s.userId) ?? {};
        return [p.shopName, p.nickname, p.email, p.phone, STATUS_LABEL[s.status], s.startedOn, s.chargesDone, s.nextChargeOn, chargeAmount(s.chargesDone, s.intro), paidBy.get(s.userId) ?? 0];
      })],
    payments: () => [['결제 번호', '매장', '날짜', '회차', '금액', '상태', '실패 사유'],
      ...data.payments.map((p) => [p.id, profileOf.get(p.userId)?.shopName, p.paidOn, p.chargeIndex + 1, p.amount, p.status, p.failure])],
    stores: () => [['매장', '동기화', '상권', '손님', '방문', '월 신규', '첫 재방문율', '단골 전환율', '활성 단골', '휴면', '진행 실험'],
      ...data.metrics.map((m) => [profileOf.get(m.userId)?.shopName ?? m.data?.shopName, m.syncedOn, m.data?.tradeAreaLabel, m.data?.customers, m.data?.visits,
        m.data?.newPerMonth, m.data?.secondVisitRate, m.data?.regularRate, m.data?.activeRegulars, m.data?.lapsedCount, m.data?.experiments?.length ?? 0])],
  };
  root.querySelectorAll('[data-csv]').forEach((btn) => btn.addEventListener('click', () => download(`waxfit-${btn.dataset.csv}-${sum.today}.csv`, csv(files[btn.dataset.csv]()))));
}

async function init() {
  const root = $('#admin');
  const be = await backend();
  if (be.mode === 'off') {
    root.innerHTML = '<p class="notice warn">결제 서버가 아직 연결되지 않았습니다. assets/js/backend-config.js를 설정하면 쓸 수 있습니다(guide/BILLING.md).</p>';
    return;
  }
  const user = await be.session();
  if (!user) {
    const loginError = loginErrorMessage(location.search);
    if (loginError) history.replaceState(null, '', location.pathname);
    root.innerHTML = `${loginError ? `<p class="notice warn">${esc(loginError)}</p>` : ''}${be.mode === 'dev' ?'<div class="form-row"><label>[로컬 테스트] 로그인 이름 <input id="dev-nickname" value="운영자" maxlength="20"></label></div>' : ''}
      <button type="button" class="btn btn-kakao btn-lg" id="login">카카오로 로그인</button>`;
    $('#login').addEventListener('click', async () => {
      await be.login({ returnTo: location.href, nickname: $('#dev-nickname')?.value.trim() || undefined });
      if (be.mode === 'dev') init();
    });
    return;
  }
  const st = await be.status();
  if (!st.isAdmin) {
    root.innerHTML = `<p class="notice bad">운영자만 볼 수 있는 화면입니다. (${esc(user.nickname)} 계정은 운영자로 등록되어 있지 않습니다.)</p>`;
    return;
  }
  const data = await be.adminData();
  render(root, adminSummary(data, st.today ?? todayKST()), data);
}

init().catch((e) => ($('#admin').innerHTML = `<p class="notice bad">불러오지 못했습니다: ${esc(e.message)}</p>`));
