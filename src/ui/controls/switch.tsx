import type { ReactNode } from 'react';
import { Switch as Base } from '@base-ui/react/switch';
import './controls.css';

/** 带文字的开关，取代 aria-pressed 切换按钮。 */
export function Switch({ checked, onCheckedChange, children }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="ctl-switch">
      <Base.Root className="ctl-switch-root" checked={checked} onCheckedChange={onCheckedChange}>
        <Base.Thumb className="ctl-switch-thumb" />
      </Base.Root>
      {children}
    </label>
  );
}
