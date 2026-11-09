// 되돌리기 어려운 동작 전에 화면 안에서 묻습니다.
// 브라우저 기본 confirm()은 앱 안 브라우저에서 막히면 '취소'로 처리되어 버튼이 아무 일도 안 하는 것처럼 보입니다.
// 포커스 가두기와 Esc 닫기는 <dialog>가 맡습니다.

/**
 * @param {string} message 줄바꿈(\n)은 그대로 보입니다
 * @param {{ confirmLabel?: string, cancelLabel?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>} 확인을 누르면 true
 */
export function askConfirm(message, { confirmLabel = '확인', cancelLabel = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('aria-label', '확인');

    const text = document.createElement('p');
    text.className = 'confirm-text';
    text.textContent = message;

    const button = (label, className) => Object.assign(document.createElement('button'), { type: 'button', textContent: label, className });
    const cancel = button(cancelLabel, 'btn btn-line confirm-cancel');
    const ok = button(confirmLabel, `btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-ok`);

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    actions.append(cancel, ok);
    dialog.append(text, actions);
    document.body.append(dialog);

    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });

    dialog.showModal();
    (danger ? cancel : ok).focus(); // 위험한 동작은 Enter를 눌러도 취소되도록
  });
}
