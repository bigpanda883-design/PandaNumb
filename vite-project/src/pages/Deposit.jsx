import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiCopy,
  FiAlertCircle,
  FiRefreshCw,
  FiLoader,
} from "react-icons/fi";
import { useBalance } from "../hooks/useBalance";
import { usePageLoading } from "../hooks/usePageLoading";
import { DepositSkeleton } from "../components/skeleton/PageSkeletons";
import {
  createVirtualAccount,
  fetchDeposits,
  fetchPaymentsConfig,
  fetchVirtualAccount,
} from "../services/apiClient";
import { setBalance } from "../wallet/walletStore";
import "../CSS/dashboard/pages/Deposit.css";

/**
 * How often the deposit list is re-read while the page is open. A bank transfer
 * is confirmed by a WEBHOOK on the server, not by this page, so this poll only
 * refreshes the display - it never decides that a payment succeeded, and it is
 * a single indexed read per tick.
 */
const DEPOSIT_POLL_MS = 15_000;

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function errorText(error, fallback) {
  const message = String(error?.message || "").trim();
  return message || fallback;
}

const STATUS_LABEL = {
  CREDITED: "Confirmed",
  PENDING: "Awaiting confirmation",
  REVIEW: "Under review",
  FAILED: "Not completed",
};

/** One-time identity input used to create the permanent account. */
function AccountSetup({ onCreated }) {
  const [idType, setIdType] = useState("bvn");
  const [identityValue, setIdentityValue] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const digits = identityValue.replace(/\D/g, "");
  const isValid = digits.length === 11;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createVirtualAccount({
        [idType]: digits,
        firstName,
        lastName,
      });
      // The identity value is never kept in component state after the call
      // completes, and this component unmounts once the account exists.
      setIdentityValue("");
      onCreated?.(result);
    } catch (createError) {
      setError(
        errorText(
          createError,
          "Your bank account could not be created yet. You can try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="deposit-card" onSubmit={handleSubmit}>
      <h3 className="card-title">Get your dedicated bank account</h3>
      <p className="min-deposit-note">
        A permanent Nigerian bank account is created for you, once. Flutterwave
        requires your BVN or NIN for this step. It is sent to Flutterwave over
        an encrypted connection and is <strong>not stored</strong> on Panda
        Number.
      </p>

      <div
        className="offer-toggle-group"
        role="tablist"
        aria-label="Identity type"
      >
        {[
          { id: "bvn", label: "BVN" },
          { id: "nin", label: "NIN" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={idType === option.id}
            className={`offer-toggle${idType === option.id ? " active" : ""}`}
            onClick={() => setIdType(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="input-wrap">
        <input
          type="text"
          className="amount-input"
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          placeholder={`Your 11-digit ${idType.toUpperCase()}`}
          value={identityValue}
          onChange={(event) => setIdentityValue(event.target.value)}
          aria-label={`Your ${idType.toUpperCase()}`}
        />
      </div>

      <div className="presets-row" style={{ marginTop: "10px" }}>
        <input
          type="text"
          className="amount-input"
          placeholder="First name"
          autoComplete="given-name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
        <input
          type="text"
          className="amount-input"
          placeholder="Last name"
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </div>

      {error && (
        <div
          className="deposit-error"
          role="alert"
          style={{ marginTop: "12px" }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="primary-btn"
        style={{ marginTop: "16px" }}
        disabled={!isValid || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <FiLoader className="spinner-icon" /> Creating your account…
          </>
        ) : (
          "Create my bank account"
        )}
      </button>

      <p className="disclaimer-text">
        Your name must match the identity you enter - Flutterwave verifies it.
      </p>
    </form>
  );
}

export default function Deposit() {
  const { balance, isLoading: balanceLoading } = useBalance();
  const { isLoading: isLoadingPage } = usePageLoading();

  const [account, setAccount] = useState(null);
  const [accountState, setAccountState] = useState("LOADING");
  const [accountError, setAccountError] = useState(null);
  const [config, setConfig] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [depositsError, setDepositsError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const copyTimer = useRef(0);

  /**
   * Load the saved account + recent deposits. Both are plain database reads on
   * the server, so this runs on mount and on the poll tick, never per render.
   */
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setAccountError(null);
    try {
      const [accountResult, depositsResult] = await Promise.all([
        fetchVirtualAccount(),
        fetchDeposits({ limit: 10 }).catch((depositFailure) => ({
          error: depositFailure,
        })),
      ]);
      if (!mounted.current) return;

      setAccount(accountResult?.account ?? null);
      setAccountState(accountResult?.state || "NOT_CREATED");
      setConfig((current) => ({
        ...(current || {}),
        configured: accountResult?.configured ?? current?.configured,
        mode: accountResult?.mode ?? current?.mode,
        missing: accountResult?.missing ?? current?.missing,
      }));

      if (depositsResult?.error) {
        setDepositsError(
          errorText(depositsResult.error, "Could not load recent deposits."),
        );
      } else {
        setDeposits(
          Array.isArray(depositsResult?.deposits)
            ? depositsResult.deposits
            : [],
        );
        setDepositsError(null);
        // The server's figure is authoritative - never the browser's arithmetic.
        if (typeof depositsResult?.balance === "number") {
          setBalance(depositsResult.balance, "deposit-refresh");
        }
      }
    } catch (loadError) {
      if (!mounted.current) return;
      setAccountError(
        errorText(loadError, "Your bank account details could not be loaded."),
      );
      setAccountState("ERROR");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load();
    fetchPaymentsConfig()
      .then((result) => {
        if (!cancelled) setConfig(result);
      })
      .catch(() => {
        // The account configuration state.
      });

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, DEPOSIT_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load]);

  const handleCopy = async () => {
    const value = account?.accountNumber;
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Older mobile browsers: a selection copy is the only option left.
        const area = document.createElement("textarea");
        area.value = value;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the number stays on screen, readable and selectable.
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const handleAccountCreated = (result) => {
    if (result?.account) {
      setAccount(result.account);
      setAccountState("ACTIVE");
    }
    setAccountError(null);
    load({ quiet: true });
  };

  if (isLoadingPage) {
    return <DepositSkeleton />;
  }

  const configured = config?.configured !== false;
  const isTestMode = config?.mode === "test";
  const showSetup = accountState === "NOT_CREATED" || accountState === "FAILED";
  const pendingDeposits = deposits.filter(
    (deposit) => !deposit.credited && deposit.status === "PENDING",
  );

  return (
    <div className="deposit-content">
      <div className="deposit-header">
        <h1>Fund wallet</h1>
        <p>
          Transfer from any bank app. Deposits reflect once payment is
          confirmed.
        </p>
      </div>

      <div className="balance-card">
        <span className="balance-label">Current balance</span>
        <h2 className="balance-amount">
          {balanceLoading && balance === null
            ? "Loading…"
            : formatNaira(balance ?? 0)}
        </h2>
      </div>

      {isTestMode && (
        <div className="demo-banner" role="status">
          <FiAlertCircle className="demo-icon" aria-hidden="true" />
          <div className="demo-text">
            <strong>Test mode</strong>
            <p>
              This server is using a Flutterwave TEST key. Transfers here do not
              move real money and are kept separate from live balances.
            </p>
          </div>
        </div>
      )}

      {!configured && (
        <div className="deposit-error" role="alert">
          Bank transfer funding is not available yet. Your balance was not
          changed.
          {Array.isArray(config?.missing) && config.missing.length > 0 && (
            <>
              {" "}
              <strong>Server setup incomplete:</strong>{" "}
              {config.missing.join(", ")}.
            </>
          )}
        </div>
      )}

      {accountError && (
        <div className="deposit-error" role="alert">
          {accountError}{" "}
          <button type="button" className="link-btn" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {accountState === "LOADING" && !account && (
        <div className="deposit-card" aria-busy="true">
          <h3 className="card-title">Loading your bank account…</h3>
          <span className="skeleton-block skeleton-line" />
          <span className="skeleton-block skeleton-line short" />
        </div>
      )}

      {account && (
        <div className="deposit-card">
          <h3 className="card-title">Transfer to your dedicated account</h3>

          <div className="transfer-amount-box">
            <span className="transfer-label">{account.bankName || "Bank"}</span>
            <p className="transfer-value" aria-label="Your account number">
              {account.accountNumber}
            </p>
            <span className="ref-text">
              {account.accountName || account.narration || ""}
            </span>
          </div>

          <button type="button" className="primary-btn" onClick={handleCopy}>
            {copied ? (
              <>
                <FiCheck aria-hidden="true" /> Account number copied
              </>
            ) : (
              <>
                <FiCopy aria-hidden="true" /> Copy account number
              </>
            )}
          </button>

          <p className="min-deposit-note" style={{ marginTop: "14px" }}>
            Open your bank app and transfer any amount to this account number.
            This account is permanently yours - transfer as often as you like.
            Your wallet is credited automatically once the bank transfer is
            confirmed, usually within a few minutes.
          </p>

          <p className="disclaimer-text">
            Sending from a bank account that is not in your name may be held for
            review.
          </p>
        </div>
      )}

      {showSetup && configured && (
        <AccountSetup onCreated={handleAccountCreated} />
      )}

      {showSetup && !configured && (
        <div className="deposit-card">
          <h3 className="card-title">Account creation unavailable</h3>
          <p className="min-deposit-note">
            Your bank account cannot be created yet because the payment provider
            is not fully configured on the server. Nothing you do here will be
            charged.
          </p>
        </div>
      )}

      {accountState === "PENDING" && !account?.accountNumber && (
        <div className="demo-banner" role="status">
          <FiAlertCircle className="demo-icon" aria-hidden="true" />
          <div className="demo-text">
            <strong>Your account is being set up</strong>
            <p>
              An account request is in progress. Refresh in a moment - it will
              not be created twice.
            </p>
          </div>
        </div>
      )}

      <div className="deposit-card">
        <div className="card-top-nav">
          <h3 className="card-title" style={{ marginBottom: 0 }}>
            Recent deposits
          </h3>
          <button
            type="button"
            className="back-btn"
            onClick={handleRefresh}
            aria-label="Refresh deposits"
            title="Refresh"
            disabled={isRefreshing}
          >
            <FiRefreshCw
              aria-hidden="true"
              className={isRefreshing ? "spin-icon" : undefined}
            />
          </button>
        </div>

        {depositsError && (
          <p className="min-deposit-note" role="alert">
            {depositsError}
          </p>
        )}

        {!depositsError && deposits.length === 0 && (
          <p className="min-deposit-note">
            No deposits yet. Your first transfer will appear here.
          </p>
        )}

        {deposits.length > 0 && (
          <ul className="deposit-list">
            {deposits.map((deposit) => (
              <li key={deposit.id} className="deposit-list-row">
                <div className="deposit-list-main">
                  <span className="detail-value">
                    {formatNaira(deposit.amount)}
                  </span>
                  <span
                    className={`deposit-state deposit-state-${String(
                      deposit.status,
                    ).toLowerCase()}`}
                  >
                    {STATUS_LABEL[deposit.status] || deposit.status}
                  </span>
                </div>
                <span className="ref-text">
                  {deposit.narration || "Bank transfer"} ·{" "}
                  {new Date(deposit.createdAt).toLocaleString("en-NG", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}

        {pendingDeposits.length > 0 && (
          <p className="min-deposit-note" role="status">
            {pendingDeposits.length === 1
              ? "One transfer is awaiting confirmation."
              : `${pendingDeposits.length} transfers are awaiting confirmation.`}{" "}
            This page updates itself.
          </p>
        )}
      </div>
    </div>
  );
}
