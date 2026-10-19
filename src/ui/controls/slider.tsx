import { Slider as Base } from '@base-ui/react/slider';
import './controls.css';

/** 单值滑条，拖动时连续回调。 */
export function Slider({ label, value, min, max, step, onValueChange, valueText, disabled }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  /** 读屏朗读的取值文字，如时刻；省略时朗读数值。 */
  valueText?: string;
  disabled?: boolean;
}) {
  return (
    // 单值模式下 Base UI 回调的是 number。
    <Base.Root className="ctl-slider" value={value} min={min} max={max} step={step} disabled={disabled} onValueChange={(next) => onValueChange(next as number)}>
      <Base.Control className="ctl-slider-control">
        <Base.Track className="ctl-slider-track">
          <Base.Indicator className="ctl-slider-indicator" />
          <Base.Thumb className="ctl-slider-thumb" getAriaLabel={() => label} getAriaValueText={valueText === undefined ? null : () => valueText} />
        </Base.Track>
      </Base.Control>
    </Base.Root>
  );
}
