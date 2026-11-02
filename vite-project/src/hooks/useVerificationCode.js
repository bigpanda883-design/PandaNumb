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
export function useVerificationCode(numberId, onCodeReceived) {
  const [code, setCode] = useState(null);
  const [receivedAt, setReceivedAt] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(0);
  const controllerRef = useRef(null);

  const pollRef = useRef(null);

  // Bumped by every stopPolling(). A poll loop reads the value it started with
  // and refuses to schedule another check once they differ, so a loop that is
  // still awaiting its HTTP response cannot come back to life after the user
  // cancelled, the code arrived, or the number changed.
  const generationRef = useRef(0);

  const stopPolling = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
    setIsPolling(false);
  }, []);

  const poll = useCallback(
    async (signal, generation) => {
      try {
        const result = await requestVerificationCode(numberId, { signal });
        if (signal?.aborted || generation !== generationRef.current) return;

        if (result.status === "CODE_RECEIVED" && result.code) {
          setCode(result.code);
          const codeReceivedAt = result.receivedAt
            ? new Date(result.receivedAt)
            : new Date();
          setReceivedAt(codeReceivedAt);
          onCodeReceived?.(result.code, codeReceivedAt);
          stopPolling();
          // The backend releases the activation with the provider once the code
          // is read, so no further action is needed here.
          return;
        }

        // A closed activation will never text again: stop instead of polling a
        // dead number every few seconds until the component unmounts.
        if (result.status === "CANCELLED" || result.status === "EXPIRED") {
          stopPolling();
          return;
        }

        // Still waiting - schedule the next check through the ref, not `poll`
        // itself, so this callback never reads its own declaration. The
        // generation passed on keeps the chain belonging to this one run.
        timerRef.current = window.setTimeout(
          () => pollRef.current?.(signal, generation),
          POLL_INTERVAL,
        );
      } catch (err) {
        if (signal?.aborted || err?.name === "AbortError") return;
        if (generation !== generationRef.current) return;
        setError(err);
        setIsPolling(false);
        controllerRef.current = null;
      }
    },
    [numberId, onCodeReceived, stopPolling],
  );

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const startPolling = useCallback(() => {
    if (!numberId) return;
    stopPolling();
    setError(null);
    setCode(null);
    setReceivedAt(null);
    setIsPolling(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    poll(controller.signal, generationRef.current);
  }, [numberId, poll, stopPolling]);

  // Clean up any in-flight timer on unmount or when the activation changes.
  useEffect(() => {
    return () => {
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
