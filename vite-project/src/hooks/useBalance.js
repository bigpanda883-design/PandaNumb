import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchBalance,
  getBalance,
  subscribeToWallet,
} from "../wallet/walletStore";

/**
 * The dashboard's balance: fetch it, then animate from ₦0 up to the real value.
 *
 * - `balance`       the authoritative value (from the backend/session)
 * - `animatedBalance` counts 0 -> balance with an ease-out curve
 * - `isLoading` / `error` drive the loading and error UI
 *
 * The animation always finishes on exactly `balance` - the last frame assigns
 * the real number rather than an interpolated one, so the displayed figure
 * matches the source of truth precisely.
 */
export function useBalance({ duration = 1200 } = {}) {
  const [balance, setBalanceState] = useState(() => getBalance());
  const [animatedBalance, setAnimatedBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(() => getBalance() === null);
  const [error, setError] = useState(null);
  const frameRef = useRef(0);

  // Load the real balance. `isLoading` already initialises to true (and to a
  // non-loading value once a balance is cached), so this never resets it before
  // the fetch - the fetch's own `finally` is what clears it.
  const load = useCallback(async (signal) => {
    try {
      const value = await fetchBalance({ signal });
      setBalanceState(value);
      setError(null);
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Deferred to a microtask so the effect itself synchronises only with the
    // fetch lifecycle; the resulting setState happens after this commit rather
    // than during it.
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  // Stay in sync with changes made elsewhere (purchase totals, deposits).
  useEffect(() => {
    return subscribeToWallet((next) => {
      setBalanceState((current) => next ?? current);
    });
  }, []);

  // Count from 0 to the real balance whenever it changes.
  useEffect(() => {
    if (typeof balance !== "number") return;

    cancelAnimationFrame(frameRef.current);

    const start = performance.now();
    const from = 0;
    const to = balance;

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      if (progress >= 1) {
        // Land exactly on the source-of-truth value.
        setAnimatedBalance(to);
        return;
      }
      setAnimatedBalance(from + (to - from) * easeOut);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [balance, duration]);

  // A retry DOES need to re-enter the loading state, so it sets that explicitly
  // rather than making every load do it.
  const retry = useCallback(() => {
    setIsLoading(true);
    setError(null);
    return load();
  }, [load]);

  return { balance, animatedBalance, isLoading, error, retry };
}
