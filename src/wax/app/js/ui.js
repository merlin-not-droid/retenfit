// 화면 도우미: 안전한 HTML 템플릿, 숫자·금액 표시, 알림, 파일 내려받기

class Raw {
  constructor(text) {
    this.text = text;
  }
  toString() {
    return this.text;
  }
}

export const raw = (text) => new Raw(text);

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function part(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Raw) return value.text;
  if (Array.isArray(value)) return value.map(part).join('');
  return esc(value);
}

/** html`<p>${사용자값}</p>` — 값은 자동으로 이스케이프, raw()·html``로 만든 값은 그대로 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += part(v) + strings[i + 1];
  });
  return new Raw(out);
}

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
export const won = (n) => (finite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '–');
export const num = (n) => (finite(n) ? Math.round(n).toLocaleString('ko-KR') : '–');
export const pct = (r, digits = 0) => (finite(r) ? `${(r * 100).toFixed(digits)}%` : '–');
export const pp = (r) => (finite(r) ? `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}%p` : '–');

export function toast(message) {
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 3200);
}

export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

let dialogCount = 0;

/**
 * 대화상자(<dialog>) 열기. 열 때마다 새로 만들고 닫히면 지웁니다.
 * (하나를 돌려 쓰면, 한 창을 닫고 바로 다른 창을 열 때 늦게 도착한 '닫힘' 처리가 새 창을 지울 수 있음)
 */
export function openDialog(content, { onMount, wide = false } = {}) {
  const dialog = document.createElement('dialog');
  if (wide) dialog.classList.add('wide');
  dialog.innerHTML = String(content);
  const heading = dialog.querySelector('h2');
  if (heading) {
    heading.id ||= `dialog-title-${(dialogCount += 1)}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
  onMount?.(dialog);
  dialog.showModal();
  return dialog;
}

/** 성별 선택 버튼 묶음 */
export function genderSeg(name, value, { all = false } = {}) {
  const options = [...(all ? [['all', '전체']] : []), ['F', '여성'], ['M', '남성']];
  return html`<div class="seg" role="radiogroup" aria-label="성별">${options.map(
    ([v, label]) => html`<label><input type="radio" name="${name}" value="${v}" ${v === value ? raw('checked') : ''}><span>${label}</span></label>`,
  )}</div>`;
}

export const ZONE_TEXT = { safe: '안전', caution: '주의', danger: '위험' };
