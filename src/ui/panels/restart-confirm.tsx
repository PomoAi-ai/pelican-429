import { t } from '../../config/i18n.ts';
import { Dialog } from '../controls/dialog.tsx';
import { mountReact } from '../react/mount.tsx';
import { useLanguage } from '../react/use-language.ts';
import './restart-confirm.css';

function RestartConfirm({ onDone }: { onDone: (confirmed: boolean) => void }) {
  useLanguage();
  return (
    <Dialog
      open
      onOpenChange={() => onDone(false)}
      title={t('确定重新开始？')}
      description={t('当前主线进度将被清除，重新从序章开始。此操作无法撤销。')}
      className="restart-confirm"
    >
      <div className="restart-confirm-actions">
        <button type="button" onClick={() => onDone(false)}>{t('取消')}</button>
        <button type="button" className="restart-confirm-accept" onClick={() => onDone(true)}>{t('重新开始')}</button>
      </div>
    </Dialog>
  );
}

/** 重新开始前的确认；取消按钮排在最前，打开时获得焦点，Esc 或点遮罩同样视为取消。 */
export function confirmStoryRestart(): Promise<boolean> {
  const container = document.createElement('div');
  document.body.append(container);
  return new Promise(resolve => {
    const unmount = mountReact(container, <RestartConfirm onDone={(confirmed) => {
      resolve(confirmed);
      // 回调发生在 Base UI 自己的事件处理中，等它处理完再卸载。
      queueMicrotask(() => {
        unmount();
        container.remove();
      });
    }} />);
  });
}
