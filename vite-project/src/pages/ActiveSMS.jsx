import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiArrowRight,
  FiCheckCircle,
  FiLoader,
  FiMessageSquare,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { useVerificationCode } from "../hooks/useVerificationCode";
import { fetchMyNumbers } from "../services/numbersApi";
import "../CSS/dashboard/pages/ActiveSMS.css";

const CLOSED_STATUSES = new Set(["CANCELLED", "COMPLETED", "EXPIRED"]);

function ActivationLog({ activation, onCodeReceived }) {
  const handleCodeReceived = useCallback(
    (code, receivedAt) => onCodeReceived(activation.id, code, receivedAt),
    [activation.id, onCodeReceived],
  );
  const {
    code,
    isPolling,
    error,
    startPolling,
  } = useVerificationCode(activation.id, handleCodeReceived);
  const currentCode = code || activation.code;

  const status = currentCode
    ? "CODE_RECEIVED"
    : String(activation.status || "WAITING").toUpperCase();
  const isClosed = CLOSED_STATUSES.has(status);

  return (
    <article className="active-log-card">
      <div className="active-log-details">
        <strong className="active-log-number">{activation.number}</strong>
        <span>
          {[activation.countryName, activation.service].filter(Boolean).join(" · ")}
        </span>
        <span className="active-log-status">
          Status: {status.replace(/_/g, " ")}
        </span>
      </div>

      {currentCode ? (
        <div className="active-log-code" aria-live="polite">
          <FiCheckCircle aria-hidden="true" />
          <span>SMS code: <strong>{currentCode}</strong></span>
        </div>
      ) : (
        <div className="active-log-actions">
          <button
            type="button"
            className="active-log-button"
            onClick={startPolling}
            disabled={isPolling || isClosed}
          >
            {isPolling ? (
              <>
                <FiLoader className="spin-icon" aria-hidden="true" />
                Waiting for code…
              </>
            ) : error ? (
              "Retry"
            ) : (
              "Get code"
            )}
          </button>
          {error && (
            <p className="active-log-error" role="alert">
              {error.message || "Could not retrieve the SMS code."}
            </p>
          )}
          {isPolling && (
            <span className="active-log-hint">
              Checking for a new SMS. You can leave this page to stop checking.
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function ActiveSMS() {
  const [activations, setActivations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadControllerRef = useRef(null);

  const loadActivations = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    try {
      const numbers = await fetchMyNumbers({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setActivations(Array.isArray(numbers) ? numbers : []);
      setError(null);
    } catch (loadError) {
      if (controller.signal.aborted || loadError?.name === "AbortError") return;
      setError(loadError);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) loadActivations();
    });
    return () => {
      cancelled = true;
      loadControllerRef.current?.abort();
    };
  }, [loadActivations]);

  const handleCodeReceived = useCallback((id, code, receivedAt) => {
    setActivations((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              code,
              codeReceived: true,
              status: "CODE_RECEIVED",
              receivedAt: receivedAt?.toISOString() || new Date().toISOString(),
            }
          : item,
      ),
    );
  }, []);

  const activeNumbers = activations.filter((item) => {
    const status = String(item.status || "").toUpperCase();
    return item.code || !CLOSED_STATUSES.has(status);
  });

  return (
    <section className="dashboard-section-page active-sms-page">
      <span className="section-overline">ACTIVE LOGS</span>
      <h1>Active Logs</h1>
      <p>Retrieve real SMS verification codes for your purchased numbers.</p>

      {error && (
        <div className="active-log-page-error" role="alert">
          {error.message || "Could not load your purchased numbers."}
          <button
            type="button"
            className="active-log-button"
            onClick={() => {
              setIsLoading(true);
              loadActivations();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="section-empty-panel" aria-live="polite">
          <FiLoader className="spin-icon" aria-hidden="true" />
          <strong>Loading your numbers…</strong>
        </div>
      ) : activeNumbers.length > 0 ? (
        <div className="active-log-list">
          {activeNumbers.map((activation) => (
            <ActivationLog
              key={activation.id}
              activation={activation}
              onCodeReceived={handleCodeReceived}
            />
          ))}
        </div>
      ) : (
        <div className="section-empty-panel">
          <FiMessageSquare aria-hidden="true" />
          <strong>No active SMS sessions</strong>
          <span>
            Buy a number first. It will appear here so you can retrieve its SMS
            code.
          </span>
          <Link to="/buy">
            Buy a number <FiArrowRight />
          </Link>
        </div>
      )}
    </section>
  );
}

export default ActiveSMS;
