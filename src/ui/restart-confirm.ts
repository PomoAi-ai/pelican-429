import { getLanguage } from './language.ts';

export function confirmStoryRestart(): Promise<boolean> {
  const en = getLanguage() === 'en';
  const dialog = document.createElement('dialog');
  dialog.className = 'restart-confirm';
  dialog.setAttribute('aria-labelledby', 'restart-confirm-title');
  dialog.setAttribute('aria-describedby', 'restart-confirm-description');
  dialog.innerHTML = `<form method="dialog">
    <p class="restart-confirm-eyebrow">PELICAN 429</p>
    <h2 id="restart-confirm-title">${en ? 'Start over?' : '确定重新开始？'}</h2>
    <p id="restart-confirm-description">${en ? 'Your current story progress will be cleared. This cannot be undone.' : '当前主线进度将被清除，重新从序章开始。此操作无法撤销。'}</p>
    <div class="restart-confirm-actions">
      <button value="cancel" autofocus>${en ? 'Cancel' : '取消'}</button>
      <button value="restart" class="restart-confirm-accept">${en ? 'Start over' : '重新开始'}</button>
    </div>
  </form>`;
  document.body.append(dialog);
  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'restart';
      dialog.remove();
      resolve(confirmed);
    }, { once: true });
    dialog.showModal();
  });
}
