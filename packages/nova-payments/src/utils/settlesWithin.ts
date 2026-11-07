/**
 * How long a request the wallet never answered blocks a second one. A wallet that lost its request (a mobile session that
 * ended) gives no answer at all, and the buyer must not be trapped by it for good.
 *
 * @internal
 */
export const OPEN_REQUEST_MS = 10 * 60 * 1000;

/**
 * Waits for a promise, but not for ever: a wallet that lost its request (a mobile session that ended) never answers, and a
 * buyer must not be trapped by it.
 *
 * @param promise - What to wait for. A rejection passes through.
 * @param ms - How long to wait.
 * @returns Whether it settled in time.
 * @internal
 */
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([promise.then(() => true), limit]);
  } finally {
    clearTimeout(timer);
  }
}
