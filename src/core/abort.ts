/** 共享下载继续缓存，取消者停止等待；GPU 编译不能使用此方法。 */
export function waitSceneResource<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cancel = (): void => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(value => {
      signal.removeEventListener('abort', cancel); resolve(value);
    }, error => {
      signal.removeEventListener('abort', cancel); reject(error);
    });
  });
}
