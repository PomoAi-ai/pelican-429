import type { ReactNode } from 'react';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup as Base } from '@base-ui/react/toggle-group';
import './controls.css';

export interface ToggleOption<V> { value: V; label: ReactNode }

/** 分段切换：总有一项按下。设置项的值可能是布尔或数字，Base UI 只收字符串，所以内部用下标作值。 */
export function ToggleGroup<V>({ label, value, options, onValueChange, disabled }: {
  label: string;
  value: V;
  options: readonly ToggleOption<V>[];
  onValueChange: (value: V) => void;
  disabled?: boolean;
}) {
  const pressed = String(options.findIndex((option) => Object.is(option.value, value)));
  return (
    <Base
      className="ctl-toggle-group"
      aria-label={label}
      value={[pressed]}
      disabled={disabled}
      onValueChange={(next) => {
        // 再点已按下的一项会得到空数组；受控值不变，该项保持按下。
        const index = next[0];
        if (index !== undefined) onValueChange(options[Number(index)]!.value);
      }}
    >
      {options.map((option, index) => <Toggle key={index} value={String(index)} className="ctl-toggle">{option.label}</Toggle>)}
    </Base>
  );
}
