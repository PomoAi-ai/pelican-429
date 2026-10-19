import type { KeyboardEvent, ReactNode } from 'react';

// React 合成事件的 stopPropagation 同时阻止原生事件继续冒泡，按键因此到不了 window 上的游戏 keydown 监听；
// 需要在焦点位于 React 根内时收到按键的游戏监听（尤其是 keyup 松键）必须挂在 window 捕获阶段，否则会卡键。
// Base UI 的 Portal 基于 ReactDOM.createPortal，合成事件沿 React 树冒泡，弹层里的按键同样经过这里。
const stop = (event: KeyboardEvent): void => event.stopPropagation();

export function KeyFence({ children }: { children: ReactNode }) {
  return <div style={{ display: 'contents' }} onKeyDown={stop} onKeyUp={stop}>{children}</div>;
}
