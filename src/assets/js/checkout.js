// 결제 페이지: 업종 선택 · 요금 일정 → 카카오 로그인 → 동의·카드 등록·첫 달 결제 → 내 구독(해지·해지 취소)
import { backend, loginErrorMessage } from './backend.js';
import { askConfirm } from './confirm-dialog.js';
import { PRICING, STATUS_LABEL, chargeSchedule, paidThroughOn, todayKST } from './billing-core.js';

const $ = (s) => document.querySelector(s);
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const date = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SERVICE_KEY = 'retenfit:service';
const SERVICE = {
  salon: { label: '미용실', lede: '미용실 대시보드를 시작합니다. 카카오 로그인 후 카드를 등록합니다.', home: '../salon/', app: '../salon/app/' },
  wax: { label: '왁싱샵', lede: '왁싱샵 대시보드를 시작합니다. 카카오 로그인 후 카드를 등록합니다.', home: '../wax/', app: '../wax/app/' },
};
const pickedService = () => document.querySelector('input[name="service"]:checked')?.value ?? 'wax';
const appUrl = () => new URL(SERVICE[pickedService()].app, location.href).href;

/** 주소의 ?service=, 지난 선택 순서로 업종을 정하고 화면 색과 문구를 맞춥니다 */
function applyService(value) {
  const service = SERVICE[value] ? value : 'wax';
  document.documentElement.dataset.service = service;
  const radio = document.querySelector(`input[name="service"][value="${service}"]`);
  if (radio) radio.checked = true;
  $('#brand-service').textContent = SERVICE[service].label;
  $('#service-lede').textContent = SERVICE[service].lede;
  $('#back-link').href = new URL(SERVICE[service].home, location.href).href;
  const open = $('#open-app');
  if (open) open.href = appUrl();
  const demo = $('#demo-link');
  if (demo) demo.href = `${appUrl()}?demo=1`;
  try {
    localStorage.setItem(SERVICE_KEY, service);
  } catch {
    /* 저장하지 못해도 이 화면에서는 동작합니다 */
  }
}

function initService() {
  let saved = null;
  try {
    saved = localStorage.getItem(SERVICE_KEY);
  } catch {
    /* 무시 */
  }
  applyService(new URLSearchParams(location.search).get('service') ?? saved);
  document.querySelectorAll('input[name="service"]').forEach((r) => r.addEventListener('change', () => applyService(r.value)));
}
const ADMIN_URL = new URL('../admin/', location.href).href;
const PENDING = 'retenfit:pending-subscribe';
const KAKAO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.5 2 10.82c0 2.8 1.86 5.25 4.66 6.63l-.95 3.48c-.08.3.26.54.52.37l4.13-2.74c.54.06 1.09.1 1.64.1 5.52 0 10-3.5 10-7.84S17.52 3 12 3z"/></svg>';

function say(text, tone = '') {
  const box = $('#msg');
  box.hidden = !text;
  box.className = `notice ${tone}`;
  box.textContent = text ?? '';
  if (text) box.scrollIntoView({ block: 'center' }); // 긴 페이지에서도 안내가 바로 보이도록
}

function renderSchedule(startedOn) {
  const rows = chargeSchedule(startedOn, PRICING.introMonths + 1).map((c) => `<tr>
    <td>${c.index === 0 ? '오늘(가입)' : `${c.index + 1}개월째`}${c.index === PRICING.introMonths ? ' · <b>정가 전환</b>' : ''}</td>
    <td>${date(c.on)}</td><td>${won(c.amount)}</td></tr>`);
  rows.push(`<tr><td>그다음부터</td><td>매달 ${Number(startedOn.slice(8, 10))}일(없는 달은 말일)</td><td>${won(PRICING.regularPrice)}</td></tr>`);
  $('#schedule').innerHTML = rows.join('');
}

function renderLogin(be, user) {
  const area = $('#login-area');
  if (user) {
    area.innerHTML = `<p><b>${esc(user.nickname)}</b>님으로 로그인했습니다. <button type="button" class="link-btn" id="logout">로그아웃</button></p>`;
    $('#logout').addEventListener('click', async () => {
      await be.logout();
      location.reload();
    });
    return;
  }
  area.innerHTML = `${be.mode === 'dev' ? '<div class="form-row"><label>[로컬 테스트] 로그인 이름 <input id="dev-nickname" value="테스트 사장님" maxlength="20"></label></div>' : ''}
    <button type="button" class="btn btn-kakao btn-lg" id="kakao-login">${KAKAO_ICON}카카오로 로그인</button>
    <p class="muted">누르면 카카오 로그인 화면으로 이동합니다. 별도 비밀번호는 없습니다.</p>`;
  $('#kakao-login').addEventListener('click', async () => {
    try {
      await be.login({ returnTo: location.href.split('?')[0], nickname: $('#dev-nickname')?.value.trim() || undefined });
      if (be.mode === 'dev') await refresh(be);
    } catch (e) {
      say(e.message, 'bad');
    }
  });
}

function renderSubscription(be, st) {
  const s = st.subscription;
  const box = $('#my-sub');
  box.hidden = !s;
  if (!s) return;
  const canceled = s.status === 'canceled';
  const next = st.next ? `${date(st.next.on)} ${won(st.next.amount)}${st.next.conversion ? ' (이번부터 정가)' : ''}` : '없음';
  $('#my-sub-body').innerHTML = `
    <table class="schedule">
      <tr><th scope="row">상태</th><td>${esc(STATUS_LABEL[s.status] ?? s.status)}</td></tr>
      <tr><th scope="row">가입일</th><td>${date(s.startedOn)}</td></tr>
      <tr><th scope="row">결제한 횟수</th><td>${s.chargesDone}회</td></tr>
      <tr><th scope="row">${canceled ? '이용 가능 기간' : '다음 결제'}</th><td>${canceled ? `${date(paidThroughOn(s))} 전날까지` : esc(next)}</td></tr>
    </table>
    ${s.status === 'past_due' ? '<p class="notice warn">결제가 되지 않아 다시 시도하고 있습니다. 카드 한도·유효기간을 확인해 주세요.</p>' : ''}
    <div class="cta-row sub-actions">
      ${st.access ? `<a class="btn btn-primary" id="open-app" href="${appUrl()}">대시보드 열기</a>` : ''}
      ${canceled ? '<button type="button" class="btn btn-line" id="resume">해지 취소</button>' : ''}
      ${['trial', 'active', 'past_due'].includes(s.status) ? '<button type="button" class="btn btn-line" id="cancel">구독 해지</button>' : ''}
      ${st.isAdmin ? `<a class="btn btn-line" href="${ADMIN_URL}">운영자 분석</a>` : ''}
    </div>`;
  $('#cancel')?.addEventListener('click', async () => {
    if (!(await askConfirm(`해지할까요? ${date(paidThroughOn(s))} 전날까지는 그대로 쓸 수 있고, 이후 결제되지 않습니다.`, { confirmLabel: '구독 해지', cancelLabel: '계속 쓰기', danger: true }))) return;
    try {
      await be.cancel();
      say('해지했습니다. 남은 기간 동안은 계속 쓸 수 있습니다.', 'ok');
      await refresh(be);
    } catch (e) {
      say(e.message, 'bad');
    }
  });
  $('#resume')?.addEventListener('click', async () => {
    try {
      await be.resume();
      say('해지를 취소했습니다. 원래 일정대로 이어집니다.', 'ok');
      await refresh(be);
    } catch (e) {
      say(e.message, 'bad');
    }
  });
}

function setPayEnabled(on, why = '') {
  $('#pay-btn').disabled = !on;
  $('#step-pay').classList.toggle('muted-step', !on);
  $('#pay-btn').title = why; // 이유가 없으면 지움(로그인 뒤에도 '먼저 로그인' 안내가 남지 않도록)
}

async function refresh(be) {
  const user = await be.session();
  renderLogin(be, user);
  if (!user) {
    $('#my-sub').hidden = true;
    $('#step-pay').hidden = false;
    setPayEnabled(false, '먼저 카카오로 로그인해 주세요.');
    return null;
  }
  let st;
  try {
    st = await be.status();
  } catch (e) {
    if (e.status === 401) {
      // 로그인 정보가 만료된 경우: 다시 로그인하도록
      await be.logout();
      renderLogin(be, null);
      setPayEnabled(false, '먼저 카카오로 로그인해 주세요.');
      say('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'warn');
      return null;
    }
    // 서버 문제: 로그인은 유지하고, 구독 상태를 확인하기 전까지 결제는 막습니다
    setPayEnabled(false, '구독 정보를 확인하지 못했습니다.');
    say('구독 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'bad');
    return null;
  }
  renderSubscription(be, st);
  // 이미 이용 중이면 결제 단계는 숨김(해지 예약 중에도 ‘해지 취소’로 이어 씀)
  $('#step-pay').hidden = Boolean(st.access);
  setPayEnabled(!st.access);
  if (st.subscription && !st.access) renderSchedule(todayKST());
  return st;
}

function readForm() {
  const f = $('#pay-form');
  return {
    customer: { shopName: f.shopName.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim() },
    agreed: { terms: f.terms.checked, privacy: f.privacy.checked, billing: f.billing.checked },
    testCard: f.testCard.value,
  };
}

/** 칸 바로 아래에 오류를 적습니다. text가 비어 있으면 지웁니다 */
function fieldError(input, text) {
  const id = `${input.name}-error`;
  let note = document.getElementById(id);
  if (!text) {
    note?.remove();
    input.removeAttribute('aria-invalid');
    return;
  }
  if (!note) {
    note = Object.assign(document.createElement('span'), { id, className: 'field-error' });
    input.after(note);
  }
  note.textContent = text;
  input.setAttribute('aria-invalid', 'true');
}

/** 틀린 칸마다 이유를 적고 첫 번째 칸으로 옮겨 갑니다 */
function validate({ customer, agreed }) {
  const f = $('#pay-form');
  const checks = [
    [f.shopName, customer.shopName ? '' : '매장 이름을 입력해 주세요.'],
    [f.phone, /^01[0-9]-?\d{3,4}-?\d{4}$/.test(customer.phone) ? '' : '휴대폰 번호를 010-1234-5678처럼 입력해 주세요.'],
    [f.email, !customer.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ? '' : '이메일 형식을 확인해 주세요. 비워 두어도 됩니다.'],
  ];
  checks.forEach(([input, text]) => fieldError(input, text));
  const wrong = checks.find(([, text]) => text);
  if (wrong) {
    say('');
    wrong[0].focus({ preventScroll: true });
    wrong[0].scrollIntoView({ block: 'center' });
    return false;
  }
  const unchecked = [[f.terms, agreed.terms], [f.privacy, agreed.privacy], [f.billing, agreed.billing]].find(([, ok]) => !ok);
  if (unchecked) {
    say('필수 항목에 모두 동의해 주세요.', 'warn');
    unchecked[0].focus({ preventScroll: true });
    return false;
  }
  return true;
}

function bindForm(be) {
  const f = $('#pay-form');
  const boxes = [f.terms, f.privacy, f.billing];
  $('#agree-all').addEventListener('change', (e) => boxes.forEach((b) => (b.checked = e.target.checked)));
  boxes.forEach((b) => b.addEventListener('change', () => ($('#agree-all').checked = boxes.every((x) => x.checked))));
  [f.shopName, f.phone, f.email].forEach((input) => input.addEventListener('input', () => fieldError(input, '')));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { customer, agreed, testCard } = readForm();
    if (!validate({ customer, agreed })) return;
    setPayEnabled(false);
    $('#pay-btn').textContent = '결제 진행 중…';
    $('#pay-btn').setAttribute('aria-busy', 'true');
    say('');
    try {
      sessionStorage.setItem(PENDING, JSON.stringify({ customer, agreed })); // 휴대폰 결제창이 돌아올 때 사용
      const st = await be.subscribe({ customer, agreed, testCard, redirectUrl: `${location.href.split('?')[0]}?return=billing` });
      sessionStorage.removeItem(PENDING);
      done(st);
      await refresh(be);
    } catch (err) {
      say(err.message, 'bad');
      setPayEnabled(true);
    } finally {
      $('#pay-btn').textContent = '결제하기 · 첫 달 4,900원';
      $('#pay-btn').removeAttribute('aria-busy');
    }
  });
}

function done(st) {
  const next = st.next ? ` 다음 결제는 ${date(st.next.on)} ${won(st.next.amount)}입니다.` : '';
  say(`첫 달 ${won(PRICING.introPrice)} 결제가 끝났습니다. ‘대시보드 열기’를 누르면 바로 시작합니다.${next}`, 'ok');
}

/** 휴대폰 결제창에서 돌아온 경우: ?billingKey=… 로 가입 마무리, 실패면 ?code=…&message=… */
async function completeRedirect(be) {
  const q = new URLSearchParams(location.search);
  if (q.get('return') !== 'billing') return;
  history.replaceState(null, '', location.pathname);
  if (q.get('code')) return say(`카드 등록이 완료되지 않았습니다. ${q.get('message') ?? ''}`, 'bad');
  const pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
  if (!q.get('billingKey') || !pending || !be.completeSubscribe) return;
  try {
    done(await be.completeSubscribe({ billingKey: q.get('billingKey'), ...pending }));
    sessionStorage.removeItem(PENDING);
  } catch (e) {
    say(e.message, 'bad');
  }
}

async function init() {
  initService();
  const loginError = loginErrorMessage(location.search);
  if (loginError) history.replaceState(null, '', location.pathname);
  renderSchedule(todayKST());
  const be = await backend();
  if (be.mode === 'off') {
    $('#mode-note').innerHTML = `<p class="notice warn">결제 오픈을 준비하고 있습니다. 요금과 결제 일정은 아래와 같습니다. 그동안 <a id="demo-link" href="${appUrl()}?demo=1">샘플 매장 화면</a>을 둘러볼 수 있습니다.</p>`;
    $('#login-area').innerHTML = '<button type="button" class="btn btn-kakao btn-lg" disabled>카카오로 로그인 (오픈 준비 중)</button>';
    setPayEnabled(false, '결제 오픈 준비 중');
    return;
  }
  if (be.mode === 'dev') {
    $('#mode-note').innerHTML = '<p class="notice">로컬 테스트 서버입니다. 카카오·카드사 대신 가짜 로그인·가짜 카드로 흐름만 확인합니다(실제 결제 없음).</p>';
    $('#test-card-field').hidden = false;
  }
  bindForm(be);
  await completeRedirect(be);
  await refresh(be);
  if (loginError) say(loginError, 'warn');
}

init().catch((e) => say(`페이지를 준비하지 못했습니다: ${e.message}`, 'bad'));
