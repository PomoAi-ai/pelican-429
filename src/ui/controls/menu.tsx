import type { ReactNode } from 'react';
import { Menu as Base } from '@base-ui/react/menu';
import './controls.css';

export interface MenuItem<V> { value: V; label: ReactNode }

/** 单选菜单（语言选择等）：触发按钮显示当前项，选中后关闭。 */
export function Menu<V>({ label, value, items, onValueChange, className = 'ctl-menu-trigger' }: {
  label: string;
  value: V;
  items: readonly MenuItem<V>[];
  onValueChange: (value: V) => void;
  /** 触发按钮的外观类，传入时取代默认的 ctl-menu-trigger（如站点导航沿用自己的按钮样式）。 */
  className?: string;
}) {
  return (
    <Base.Root>
      <Base.Trigger className={className} aria-label={label}>
        {items.find((item) => Object.is(item.value, value))!.label}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner className="ctl-positioner" sideOffset={6} align="end">
          <Base.Popup className="ctl-popup" aria-label={label}>
            <Base.RadioGroup value={value} onValueChange={onValueChange}>
              {items.map((item, index) => (
                <Base.RadioItem key={index} value={item.value} closeOnClick className="ctl-item">
                  <Base.RadioItemIndicator className="ctl-item-indicator">✓</Base.RadioItemIndicator>
                  {item.label}
                </Base.RadioItem>
              ))}
            </Base.RadioGroup>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
