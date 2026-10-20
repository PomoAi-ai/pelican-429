import type { ReactNode } from 'react';
import { Select as Base } from '@base-ui/react/select';
import './controls.css';

interface SelectItem<V> { value: V; label: ReactNode }

/** 下拉选择，取代原生 select；value 总有一项被选中。 */
export function Select<V>({ label, value, items, onValueChange, disabled }: {
  label: string;
  value: V;
  items: readonly SelectItem<V>[];
  onValueChange: (value: V) => void;
  disabled?: boolean;
}) {
  return (
    // 选项里没有 null，Base UI 签名里的 null 不会出现。
    <Base.Root items={items} value={value} onValueChange={(next) => onValueChange(next!)} disabled={disabled}>
      <Base.Trigger className="ctl-select" aria-label={label}>
        <Base.Value />
        <Base.Icon className="ctl-select-icon">▾</Base.Icon>
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner className="ctl-positioner" sideOffset={4}>
          <Base.Popup className="ctl-popup">
            <Base.List>
              {items.map((item, index) => (
                <Base.Item key={index} value={item.value} className="ctl-item">
                  <Base.ItemIndicator className="ctl-item-indicator">✓</Base.ItemIndicator>
                  <Base.ItemText>{item.label}</Base.ItemText>
                </Base.Item>
              ))}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
