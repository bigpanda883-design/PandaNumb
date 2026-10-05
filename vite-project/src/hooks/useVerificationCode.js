import { useCallback, useEffect, useRef, useState } from "react";
import { requestVerificationCode, cancelNumber } from "../services/numbersApi";

const POLL_INTERVAL = Number(import.meta.env?.VITE_SMS_POLL_INTERVAL) || 5000;

/**
 * Polls OUR backend for the verification code belonging to one purchased number.
 *
 * The backend owns the provider API key and asks the provider whether the SMS
 * has arrived; it only ever returns a code the provider actually delivered.
 * Nothing is generated locally - `code` is only ever what the provider returned.
 *
 * @param {string|null} numberId  the purchased number's id (activation id)
 */
export function useVerificationCode(numberId) {
  const [code, setCode] = useState(null);
  const [receivedAt, setReceivedAt] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
    setIsPolling(false);
  }, []);

  // `pollRef` breaks the self-reference: `poll` schedules the next call, so it
  // cannot close over itself. The ref always points at the latest `poll` for the
  // current number, and the effect below keeps it assigned on every render.
  const pollRef = useRef(null);

  const poll = useCallback(
    async (signal) => {
      try {
        const result = await requestVerificationCode(numberId, { signal });
        if (signal?.aborted) return;

        if (result.status === "CODE_RECEIVED" && result.code) {
          setCode(result.code);
          setReceivedAt(result.receivedAt ? new Date(result.receivedAt) : new Date());
          setIsPolling(false);
          // The backend releases the activation with the provider once the code
          // is read, so no further action is needed here.
          return;
        }

        if (result.status === "CANCELLED") {
          setIsPolling(false);
          return;
        }

        // Still waiting - schedule the next check through the ref, not `poll`
        // itself, so this callback never reads its own declaration.
        timerRef.current = window.setTimeout(
          () => pollRef.current?.(signal),
          POLL_INTERVAL,
        );
      } catch (err) {
        if (signal?.aborted || err?.name === "AbortError") return;
        setError(err);
        setIsPolling(false);
      }
    },
    [numberId],
  );

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const startPolling = useCallback(() => {
    if (!numberId) return;
    stopPolling();
    setError(null);
    setIsPolling(true);
    poll();
  }, [numberId, poll, stopPolling]);

  // Clean up any in-flight timer on unmount or when the activation changes.
  useEffect(() => {
    const controller = new AbortController();
    return () => {
      controller.abort();
      stopPolling();
    };
  }, [stopPolling]);

  /** Cancel the number and refund it through our backend. */
  const cancel = useCallback(async () => {
    if (!numberId) return null;
    stopPolling();
    return cancelNumber(numberId);
  }, [numberId, stopPolling]);

  /** Ask the provider for a fresh SMS on the same number. */
  const requestAnotherCode = useCallback(async () => {
    if (!numberId) return null;
    setCode(null);
    setError(null);
    startPolling();
    return true;
  }, [numberId, startPolling]);

  return {
    code,
    receivedAt,
    isPolling,
    error,
    startPolling,
    cancel,
    requestAnotherCode,
  };
}
