import type { ReactNode } from 'react';
import { Dialog as Base } from '@base-ui/react/dialog';
import './controls.css';

/** 受控弹窗：open 由外观的 store 持有，onOpenChange 立即写回，游戏循环才能同步读到开关状态。 */
export function Dialog({ open, onOpenChange, title, className, children, description, disablePointerDismissal }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  className: string;
  children: ReactNode;
  /** 说明文字，经 aria-describedby 关联到弹窗。 */
  description?: ReactNode;
  /** 点遮罩不关闭，只能经按钮或 Esc 关闭（编辑中的草稿不会被误点丢掉）。 */
  disablePointerDismissal?: boolean;
}) {
  return (
    <Base.Root open={open} onOpenChange={onOpenChange} disablePointerDismissal={disablePointerDismissal}>
      <Base.Portal>
        <Base.Backdrop className="ctl-dialog-backdrop" />
        <Base.Popup className={`ctl-dialog ${className}`}>
          <Base.Title className="ctl-dialog-title">{title}</Base.Title>
          {description !== undefined && <Base.Description className="ctl-dialog-description">{description}</Base.Description>}
          {children}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
