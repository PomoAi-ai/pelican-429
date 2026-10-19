/** 命令式外观与 React 视图之间的状态桥：外观同步读写，组件用 useSyncExternalStore(store.subscribe, store.get) 订阅。 */
export interface Store<T> {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      // update() 每帧调用，值未变时不通知，避免无谓重渲染。
      if (Object.is(value, next)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
