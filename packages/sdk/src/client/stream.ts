import { retryWithBackoff } from './retry';
import type { ClientOptions, WriteOptions, WriteStatus } from './options';

export class StellarStreamsClient {
  private options: ClientOptions;

  constructor(options: ClientOptions = {}) {
    this.options = options;
  }

  async getStream(streamId: string, signal?: AbortSignal): Promise<unknown> {
    return retryWithBackoff(
      async () => {
        signal?.throwIfAborted();
        // Simulate read transport call
        return { streamId, data: 'ok' };
      },
      this.options.retryAttempts ?? 3,
      this.options.retryBaseDelayMs ?? 200,
      signal,
    );
  }

  async executeWrite(action: () => Promise<unknown>, options?: WriteOptions): Promise<unknown> {
    const signal = options?.signal;
    const notify = (status: WriteStatus, error?: unknown) => {
      options?.onStatusChange?.(status, error);
      this.options.onStatusChange?.(status, error);
    };

    try {
      signal?.throwIfAborted();
      notify('simulating');
      // simulate step
      await new Promise((r) => setTimeout(r, 10));
      signal?.throwIfAborted();

      notify('signing');
      // signing step
      await new Promise((r) => setTimeout(r, 10));
      signal?.throwIfAborted();

      notify('submitting');
      // submitting step
      await new Promise((r) => setTimeout(r, 10));
      signal?.throwIfAborted();

      notify('polling');
      // polling step
      await new Promise((r) => setTimeout(r, 10));
      signal?.throwIfAborted();

      const result = await action();
      notify('confirmed');
      return result;
    } catch (err) {
      notify('failed', err);
      throw err;
    }
  }
}
