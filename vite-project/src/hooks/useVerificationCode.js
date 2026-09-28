import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkStatus,
  GET_STATUS,
  setStatus,
  SET_STATUS,
} from "../services/smsProvider";

const POLL_INTERVAL = Number(import.meta.env?.VITE_SMS_POLL_INTERVAL) || 5000;

/**
 * Polls the provider for the verification code belonging to one activation.
 *
 * The provider only reveals a code once the SMS has actually arrived, so this
 * polls `getStatus` on an interval until it does. Nothing is generated locally -
 * `code` is only ever what the provider returned.
 *
 * @param {string|null} activationId  provider activation id (from requestNumber)
 */
export function useVerificationCode(activationId) {
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
  // current activation, and the inner healer below keeps it assigned on every
  // render.
  const pollRef = useRef(null);

  const poll = useCallback(
    async (signal) => {
      try {
        const result = await checkStatus(activationId, { signal });
        if (signal?.aborted) return;

        if (result.status === GET_STATUS.CODE_RECEIVED && result.code) {
          setCode(result.code);
          setReceivedAt(new Date());
          setIsPolling(false);
          // The number is finished with once the code is read.
          setStatus(activationId, SET_STATUS.FINISH_NO_REFUND).catch(() => {});
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
    [activationId],
  );

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const startPolling = useCallback(() => {
    if (!activationId) return;
    stopPolling();
    setError(null);
    setIsPolling(true);
    poll();
  }, [activationId, poll, stopPolling]);

  // Clean up any in-flight timer on unmount or when the activation changes.
  useEffect(() => {
    const controller = new AbortController();
    return () => {
      controller.abort();
      stopPolling();
    };
  }, [stopPolling]);

  /** Cancel the activation and refund it with the provider. */
  const cancel = useCallback(async () => {
    if (!activationId) return null;
    stopPolling();
    return setStatus(activationId, SET_STATUS.CANCEL_AND_REFUND);
  }, [activationId, stopPolling]);

  /** Ask the provider for a fresh SMS on the same number. */
  const requestAnotherCode = useCallback(async () => {
    if (!activationId) return null;
    setCode(null);
    setError(null);
    await setStatus(activationId, SET_STATUS.REQUEST_ANOTHER_CODE);
    startPolling();
    return true;
  }, [activationId, startPolling]);

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
