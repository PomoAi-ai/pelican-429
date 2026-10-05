/**
 * 性能面板（任务 019）：设置面板“调试 → 性能面板”开关，?debug 下也可按 P；左上方等宽小窗，显示 FPS、帧时间、CPU 帧内耗时与分段、draw call、三角形。
 * 文本每 PANEL_REFRESH_MS 刷新一次（避免每帧改 DOM）；隐藏时不刷新（main 也只在可见时计时）。不依赖 three/render。
 */
import type { PerfSnapshot } from '../core/frame-profiler.ts';
import { getLanguage, onLanguageChange, type Language } from './language.ts';

export const PANEL_REFRESH_MS = 250;

const fmtCount = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

/** 面板文本（纯函数，测试用）。 */
export function formatPerfText(s: PerfSnapshot, language: Language = 'zh'): string {
  const lines = [`FPS    ${s.fps.toFixed(1)}`, `${language === 'en' ? 'Frame ' : '帧    '}${s.frameTime.toFixed(1)} ms`, `CPU    ${s.cpu.toFixed(2)} ms`];
  for (const [k, v] of Object.entries(s.segments)) lines.push(`  ${k.padEnd(8)}${v.toFixed(2)}`);
  lines.push(`draw   ${Math.round(s.calls)}`, `tris   ${fmtCount(s.triangles)}`);
  return lines.join('\n');
}

export interface PerfPanel {
  readonly visible: boolean;
  toggle(): void;
  setVisible(visible: boolean): void;
  /** 每帧调用；按 PANEL_REFRESH_MS 节流刷新文本。 */
  update(snapshot: () => PerfSnapshot, nowMs: number): void;
  dispose(): void;
}

/** keyTarget 非 null 时监听 P 键切换（?debug）；null 只由 setVisible/toggle 控制。 */
export function createPerfPanel(parent: HTMLElement, keyTarget: Window | null): PerfPanel {
  if (!parent?.isConnected) throw new Error('perf-panel: parent element is missing or detached');
  const el = document.createElement('pre');
  el.className = 'perf-panel';
  Object.assign(el.style, {
    position: 'fixed',
    left: '12px',
    top: '80px',
    margin: '0',
    padding: '6px 10px',
    borderRadius: '6px',
    background: 'rgba(12, 16, 22, 0.72)',
    color: '#d8f0c8',
    font: '11px/1.45 ui-monospace, "SF Mono", Menlo, monospace',
    pointerEvents: 'none',
    zIndex: '5',
    whiteSpace: 'pre',
  } satisfies Partial<CSSStyleDeclaration>);
  el.hidden = true;
  parent.append(el);
  let lastRefresh = Number.NEGATIVE_INFINITY;
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyP' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    panel.toggle();
  };
  keyTarget?.addEventListener('keydown', onKey);
  const unsubscribeLanguage = onLanguageChange(() => { lastRefresh = Number.NEGATIVE_INFINITY; });
  const panel: PerfPanel = {
    get visible() {
      return !el.hidden;
    },
    toggle() {
      panel.setVisible(!panel.visible);
    },
    setVisible(visible) {
      if (visible === !el.hidden) return;
      el.hidden = !visible;
      lastRefresh = Number.NEGATIVE_INFINITY;
    },
    update(snapshot, nowMs) {
      if (el.hidden || nowMs - lastRefresh < PANEL_REFRESH_MS) return;
      lastRefresh = nowMs;
      el.textContent = formatPerfText(snapshot(), getLanguage());
    },
    dispose() {
      keyTarget?.removeEventListener('keydown', onKey);
      unsubscribeLanguage();
      el.remove();
    },
  };
  return panel;
}
