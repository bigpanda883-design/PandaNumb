import { useState } from "react";
import {
  FiCreditCard,
  FiChevronLeft,
  FiAlertCircle,
  FiCheckCircle,
} from "react-icons/fi";
import { useBalance } from "../hooks/useBalance";
import { usePageLoading } from "../hooks/usePageLoading";
import { DepositSkeleton } from "../components/skeleton/PageSkeletons";
import { depositToWallet } from "../services/apiClient";
import { setBalance } from "../wallet/walletStore";
import { addTransaction } from "../wallet/transactionStore";
import "../CSS/dashboard/pages/Deposit.css";

const PRESET_AMOUNTS = [100, 500, 1000, 2000, 5000, 10000, 20000];

export default function Deposit() {
  const [step, setStep] = useState(1);
  // Shared wallet balance - the same source the dashboard reads.
  const { balance, isLoading: balanceLoading } = useBalance();
  const { isLoading: isLoadingPage } = usePageLoading();
  const [amount, setAmount] = useState(1000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const formatCurrency = (val) => {
    return `₦${Number(val).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleSelectPreset = (val) => {
    setAmount(val);
  };

  const handleAmountChange = (e) => {
    const val = e.target.value.replace(/\D/g, "");
    setAmount(val ? parseInt(val, 10) : "");
  };

  const handleProceedToPayment = () => {
    if (!amount || amount < 100) return;
    setError(null);
    setSuccessMessage(null);
    setStep(2);
  };

  const handleConfirmDeposit = async () => {
    if (!amount || amount < 100 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await depositToWallet(Number(amount));
      // The backend returns the AUTHORITATIVE post-deposit balance. Setting it
      // (rather than crediting the amount again) is what keeps the displayed
      // balance equal to the server's - crediting would double-count the deposit.
      const nextBalance = Number(response?.balance);
      if (Number.isFinite(nextBalance)) {
        setBalance(nextBalance, "demo-deposit");
      }
      addTransaction({
        type: "deposit",
        title: "Wallet deposit",
        amount: Number(amount),
        path: "/deposit",
        reference: response?.transaction?.reference || `DEP-${Date.now()}`,
      });
      setSuccessMessage(
        `Deposit successful. Your wallet was credited with ₦${Number(amount).toLocaleString()}.`,
      );
      setStep(1);
      setAmount(1000);
    } catch (depositError) {
      setError(
        depositError?.message ||
          "Card funding is not available yet. Your balance was not changed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingPage) {
    return <DepositSkeleton />;
  }

  return (
    <div className="deposit-content">
      <div className="deposit-header">
        <h1>Fund wallet</h1>
        <p>Deposits reflect as soon as payment is confirmed.</p>
      </div>

      <div className="balance-card">
        <span className="balance-label">Current balance</span>
        <h2 className="balance-amount">
          {balanceLoading && balance === null
            ? "Loading…"
            : formatCurrency(balance ?? 0)}
        </h2>
      </div>

      {error && (
        <div className="deposit-error" role="alert">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="deposit-success" role="status">
          <FiCheckCircle aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* STEP 1: ENTER AMOUNT */}
      {step === 1 && (
        <div className="deposit-card">
          <h3 className="card-title">Amount to deposit</h3>

          <div className="input-wrap">
            <span className="currency-symbol">₦</span>
            <input
              type="text"
              className="amount-input"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0"
            />
          </div>

          <p className="min-deposit-note">ⓘ Minimum deposit is ₦100.00</p>

          {/* PRESETS CONTAINER (Flexbox) */}
          <div className="presets-flex-container">
            <div className="presets-row">
              {PRESET_AMOUNTS.slice(0, 4).map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`preset-btn ${
                    Number(amount) === val ? "selected" : ""
                  }`}
                  onClick={() => handleSelectPreset(val)}
                >
                  ₦{val.toLocaleString()}
                </button>
              ))}
            </div>
            <div className="presets-row">
              {PRESET_AMOUNTS.slice(4).map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`preset-btn ${
                    Number(amount) === val ? "selected" : ""
                  }`}
                  onClick={() => handleSelectPreset(val)}
                >
                  ₦{val.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="primary-btn"
            onClick={handleProceedToPayment}
            disabled={!amount || amount < 100}
          >
            <FiCreditCard /> Continue to payment
          </button>
        </div>
      )}

      {/* STEP 2: PAYMENT PENDING */}
      {step === 2 && (
        <div className="deposit-card">
          <div className="card-top-nav">
            <button
              type="button"
              className="back-btn"
              onClick={() => setStep(1)}
            >
              <FiChevronLeft />
            </button>
            <h3 className="card-title">Card payment not available yet</h3>
          </div>
          <div className="demo-banner" role="status">
            <FiAlertCircle className="demo-icon" aria-hidden="true" />
            <div className="demo-text">
              <strong>Payment provider not connected</strong>
              <p>
                Card funding is still being set up. Nothing will be charged and
                your balance will not change. Buying a number needs wallet funds,
                so number purchases stay unavailable until card funding is live.
              </p>
            </div>
          </div>

          <div className="deposit-confirm-amount">
            Amount you selected: <strong>₦{Number(amount).toLocaleString()}</strong>
          </div>

          <button
            type="button"
            className="primary-btn"
            onClick={handleConfirmDeposit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Checking payment status..." : "Continue"}
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => setStep(1)}
            style={{ marginTop: "10px" }}
          >
            <FiChevronLeft aria-hidden="true" /> Back to amount
          </button>
        </div>
      )}
    </div>
  );
}
