interface QueueWaiter {
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  abort?: () => void;
  settled: boolean;
}

interface ConnectionQueue {
  active: boolean;
  waiters: QueueWaiter[];
}

export class ModelConnectionInferenceQueue {
  private readonly queues = new Map<number, ConnectionQueue>();

  get connectionCount(): number {
    return this.queues.size;
  }

  waitingCount(connectionId: number): number {
    return this.queues.get(connectionId)?.waiters.length ?? 0;
  }

  async acquire(connectionId: number, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
    }

    const existing = this.queues.get(connectionId);
    if (!existing) {
      const queue: ConnectionQueue = { active: true, waiters: [] };
      this.queues.set(connectionId, queue);
      return this.createRelease(connectionId, queue);
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: QueueWaiter = { resolve, reject, signal, settled: false };
      waiter.abort = (): void => {
        if (waiter.settled) return;
        waiter.settled = true;
        const index = existing.waiters.indexOf(waiter);
        if (index >= 0) existing.waiters.splice(index, 1);
        reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', waiter.abort, { once: true });
      existing.waiters.push(waiter);
    });
  }

  private createRelease(connectionId: number, queue: ConnectionQueue): () => void {
    let released = false;
    return (): void => {
      if (released) return;
      released = true;

      const waiter = queue.waiters.shift();
      if (waiter) {
        waiter.settled = true;
        if (waiter.abort) waiter.signal?.removeEventListener('abort', waiter.abort);
        waiter.resolve(this.createRelease(connectionId, queue));
        return;
      }

      queue.active = false;
      if (this.queues.get(connectionId) === queue) this.queues.delete(connectionId);
    };
  }
}
