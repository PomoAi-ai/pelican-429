/** 简单事件队列：逻辑层 push，事件跨 tick 累积，由调用方（渲染/UI）每帧 drain。 */
export class EventQueue<T> {
  private items: T[] = [];

  push(event: T): void {
    this.items.push(event);
  }

  /** 取出并清空全部事件（按入队顺序）。 */
  drain(): T[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  get size(): number {
    return this.items.length;
  }
}
