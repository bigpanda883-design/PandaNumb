import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiCopy,
  FiAlertCircle,
  FiRefreshCw,
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
  const [identityType, setIdentityType] = useState("bvn");
  const [identityNumber, setIdentityNumber] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountSetupError, setAccountSetupError] = useState(null);

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
     try {
       const [accountResult, depositsResult] = await Promise.all([
        fetchVirtualAccount(),
        fetchDeposits({ limit: 10 }).catch((depositFailure) => ({
          error: depositFailure,
        })),
      ]);
      if (!mounted.current) return;

      if (!quiet) setAccountError(null);
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
    void Promise.resolve().then(() => {
      if (!cancelled) return load({ quiet: true });
      return undefined;
    });
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
    try {
      await load();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateAccount = async (event) => {
    event.preventDefault();
    const identifier = identityNumber.trim();
    if (!/^\d{11}$/.test(identifier)) {
      setAccountSetupError(`${identityType.toUpperCase()} must contain 11 digits.`);
      return;
    }

    setIsCreatingAccount(true);
    setAccountSetupError(null);
    try {
      const result = await createVirtualAccount({
        [identityType]: identifier,
      });
      setAccount(result?.account ?? null);
      setAccountState(result?.state || result?.account?.status || "PENDING");
      await load({ quiet: true });
    } catch (error) {
      setAccountSetupError(
        errorText(error, "Flutterwave could not create your bank account."),
      );
      if (error?.code === "ACCOUNT_CREATION_PENDING") {
        setAccountState("PENDING");
      }
    } finally {
      setIdentityNumber("");
      setIsCreatingAccount(false);
    }
  };

  if (isLoadingPage) {
    return <DepositSkeleton />;
  }

  const configured = config?.configured !== false;
  const isTestMode = config?.mode === "test";
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
          <p className="account-status">
            Account status: <strong>{account.status || "UNKNOWN"}</strong>
          </p>

          <div className="transfer-amount-box">
            <span className="transfer-label">{account.bankName || "Bank"}</span>
            <p className="transfer-value" aria-label="Your account number">
              {account.accountNumber}
            </p>
            {account.accountName && (
              <span className="ref-text">{account.accountName}</span>
            )}
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
            {account.status === "ACTIVE"
              ? " This account is permanently yours. Your wallet is credited only after Flutterwave confirms the transfer."
              : " Do not transfer until Flutterwave confirms that this account is active."}
          </p>

          <p className="disclaimer-text">
            Sending from a bank account that is not in your name may be held for
            review.
          </p>
        </div>
      )}

      {!account && accountState === "UNAVAILABLE" && (
        <div className="deposit-card">
          <h3 className="card-title">Dedicated bank account unavailable</h3>
          <p className="min-deposit-note">
            Panda Number does not collect BVN or NIN. Flutterwave requires one
            to create a permanent virtual account, so we cannot provide a
            dedicated bank account until an ID-free funding option is available.
          </p>
        </div>
      )}

      {!account &&
        configured &&
        ["NOT_CREATED", "FAILED"].includes(accountState) && (
          <div className="deposit-card">
            <h3 className="card-title">Set up your permanent bank account</h3>
            <p className="min-deposit-note">
              Flutterwave requires one identity number to issue a permanent
              account. Enter it once; Panda Number sends it to Flutterwave for
              account setup and does not save it.
            </p>
            <form className="account-setup-form" onSubmit={handleCreateAccount}>
              <div className="identity-choice" role="group" aria-label="Identity type">
                <label>
                  <input
                    type="radio"
                    name="identityType"
                    value="bvn"
                    checked={identityType === "bvn"}
                    onChange={() => setIdentityType("bvn")}
                    disabled={isCreatingAccount}
                  />
                  BVN
                </label>
                <label>
                  <input
                    type="radio"
                    name="identityType"
                    value="nin"
                    checked={identityType === "nin"}
                    onChange={() => setIdentityType("nin")}
                    disabled={isCreatingAccount}
                  />
                  NIN
                </label>
              </div>
              <label className="identity-input-label" htmlFor="account-identity">
                {identityType.toUpperCase()}
              </label>
              <input
                id="account-identity"
                name="accountIdentity"
                className="account-identity-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={11}
                value={identityNumber}
                onChange={(event) =>
                  setIdentityNumber(event.target.value.replace(/\D/g, "").slice(0, 11))
                }
                aria-describedby="account-identity-privacy"
                required
                disabled={isCreatingAccount}
              />
              <p id="account-identity-privacy" className="min-deposit-note">
                Do not enter this on a shared device. Your identifier is not
                stored in your Panda Number account.
              </p>
              {accountSetupError && (
                <p className="deposit-error" role="alert">
                  {accountSetupError}
                </p>
              )}
              <button
                type="submit"
                className="primary-btn"
                disabled={isCreatingAccount || identityNumber.length !== 11}
              >
                {isCreatingAccount ? "Contacting Flutterwave…" : "Create bank account"}
              </button>
            </form>
          </div>
        )}

      {!account && accountState === "PENDING" && (
        <div className="deposit-card" role="status">
          <h3 className="card-title">Account setup is being confirmed</h3>
          <p className="min-deposit-note">
            Flutterwave did not confirm whether it created the account. To
            prevent duplicate accounts, setup is paused while this is checked.
            Contact support before retrying.
          </p>
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
                {deposit.reference && (
                  <span className="ref-text">
                    Reference: {deposit.reference}
                    {deposit.flutterwaveReference
                      ? ` · Flutterwave: ${deposit.flutterwaveReference}`
                      : ""}
                  </span>
                )}
                {deposit.credited &&
                  typeof deposit.previousBalance === "number" &&
                  typeof deposit.newBalance === "number" && (
                    <span className="ref-text">
                      Balance: {formatNaira(deposit.previousBalance)} →{" "}
                      {formatNaira(deposit.newBalance)}
                    </span>
                  )}
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
