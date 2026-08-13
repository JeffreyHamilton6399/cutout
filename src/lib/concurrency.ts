"use client";

/**
 * Tiny concurrency limiter for batch processing. Runs async tasks with at
 * most `concurrency` in flight, preserving order of results.
 */
export async function runWithConcurrency<T, R = void>(
  items: T[],
  concurrency: number,
  // Whatever the worker resolves to is ignored — callers that report per-item
  // outcomes shouldn't have to widen their own return type to match.
  worker: (item: T, index: number) => Promise<R>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/**
 * Settle as soon as `signal` aborts, instead of waiting for `promise`.
 *
 * Some work simply can't be interrupted: @imgly validates its config with a
 * schema that strips unknown keys (so a `signal` handed to it is silently
 * dropped), and transformers.js exposes no cancellation at all. Racing is what
 * we can actually honour — the caller stops waiting immediately, and the
 * orphaned worker finishes into a result nobody reads.
 */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (err) => {
        cleanup();
        reject(err);
      },
    );
  });
}
