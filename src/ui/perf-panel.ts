/**
 * 性能面板：Cmd+Option+Z / Ctrl+Alt+Z 或设置面板切换，调试模式也可按 P；显示 FPS、帧时间、CPU 耗时、draw call、三角形。
 * 默认显示简洁 FPS，点击展开完整信息；每 PANEL_REFRESH_MS 刷新一次，收起时不启用分段计时。
 */
import type { PerfSnapshot } from '../core/frame-profiler.ts';
import { getLanguage, onLanguageChange, type Language } from './language.ts';

export const PANEL_REFRESH_MS = 250;

const fmtCount = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

/** 面板文本（纯函数，测试用）。 */
export function formatPerfText(s: PerfSnapshot, language: Language, version: string): string {
  const lines = [`FPS    ${s.fps.toFixed(1)} · v${version}`, `${language === 'en' ? 'Frame ' : '帧    '}${s.frameTime.toFixed(1)} ms`, `CPU    ${s.cpu.toFixed(2)} ms`];
  for (const [k, v] of Object.entries(s.segments)) lines.push(`  ${k.padEnd(8)}${v.toFixed(2)}`);
  lines.push(`draw   ${Math.round(s.calls)}`, `tris   ${fmtCount(s.triangles)}`);
  return lines.join('\n');
}

export interface PerfPanel {
  /** 完整信息是否展开；收起时仍显示 FPS。 */
  readonly visible: boolean;
  toggle(): void;
  setVisible(visible: boolean): void;
  /** 每帧调用；按 PANEL_REFRESH_MS 节流刷新文本。 */
  update(snapshot: () => PerfSnapshot, nowMs: number, fps: number): void;
  dispose(): void;
}

/** 游戏场景始终支持 Cmd+Option+Z / Ctrl+Alt+Z，P 键仅在调试模式启用。 */
export function createPerfPanel(parent: HTMLElement, keyTarget: Window, debug: boolean, version: string): PerfPanel {
  if (!parent?.isConnected) throw new Error('perf-panel: parent element is missing or detached');
  const el = document.createElement('button');
  el.className = 'perf-panel';
  el.type = 'button';
  el.setAttribute('aria-expanded', 'false');
  let expanded = false;
  Object.assign(el.style, {
    position: 'fixed',
    left: '24px',
    top: '88px',
    margin: '0',
    padding: '6px 10px',
    borderRadius: '6px',
    background: 'transparent',
    color: '#d8f0c8',
    font: '11px/1.45 ui-monospace, "SF Mono", Menlo, monospace',
    pointerEvents: 'auto',
    cursor: 'pointer',
    border: '0',
    textAlign: 'left',
    zIndex: '5',
    whiteSpace: 'pre',
  } satisfies Partial<CSSStyleDeclaration>);
  el.textContent = `FPS … · v${version}`;
  el.addEventListener('click', () => panel.toggle());
  parent.append(el);
  let lastRefresh = Number.NEGATIVE_INFINITY;
  const onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;
    if (e.shiftKey) return;
    const shortcut = e.code === 'KeyZ' && e.altKey && (e.ctrlKey || e.metaKey);
    const debugShortcut = debug && e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!shortcut && !debugShortcut) return;
    e.preventDefault();
    if (!e.repeat) panel.toggle();
  };
  keyTarget.addEventListener('keydown', onKey);
  const unsubscribeLanguage = onLanguageChange(() => { lastRefresh = Number.NEGATIVE_INFINITY; });
  const panel: PerfPanel = {
    get visible() {
      return expanded;
    },
    toggle() {
      panel.setVisible(!panel.visible);
    },
    setVisible(visible) {
      if (visible === expanded) return;
      expanded = visible;
      el.setAttribute('aria-expanded', String(expanded));
      lastRefresh = Number.NEGATIVE_INFINITY;
    },
    update(snapshot, nowMs, fps) {
      if (nowMs - lastRefresh < PANEL_REFRESH_MS) return;
      lastRefresh = nowMs;
      el.textContent = expanded ? formatPerfText(snapshot(), getLanguage(), version) : `FPS ${fps.toFixed(0)} · v${version}`;
    },
    dispose() {
      keyTarget.removeEventListener('keydown', onKey);
      unsubscribeLanguage();
      el.remove();
    },
  };
  return panel;
}
