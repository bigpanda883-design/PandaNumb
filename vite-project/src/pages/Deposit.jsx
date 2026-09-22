import { useState } from "react";
import {
  FiCreditCard,
  FiChevronLeft,
  FiCopy,
  FiArrowRight,
  FiCheckCircle,
  FiLoader,
  FiCheck,
} from "react-icons/fi";
import { FaBuildingColumns } from "react-icons/fa6";
import "../CSS/dashboard/pages/Deposit.css";

const PRESET_AMOUNTS = [100, 500, 1000, 2000, 5000, 10000, 20000];

export default function Deposit() {
  const [step, setStep] = useState(1);
  const [balance, setBalance] = useState(9650);
  const [amount, setAmount] = useState(1000);
  const [transactionRef, setTransactionRef] = useState("");
  const [copied, setCopied] = useState(false);

  const bankDetails = {
    bankName: "PalmPay",
    accountNumber: "9048247067",
    accountName: "Panda Numbers",
  };

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
    setStep(2);
  };

  const handleCopyAccount = () => {
    navigator.clipboard.writeText(bankDetails.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmPayment = () => {
    setStep(3);
    const randomRef =
      "PN-TEST-" +
      Math.random().toString(36).substring(2, 8).toUpperCase() +
      "-PPZY";
    setTransactionRef(randomRef);

    setTimeout(() => {
      setBalance((prev) => prev + Number(amount));
      setStep(4);
    }, 2200);
  };

  const handleReset = () => {
    setStep(1);
    setAmount(1000);
  };

  return (
    <div className="deposit-content">
      <div className="deposit-header">
        <h1>Fund wallet</h1>
        <p>Deposits reflect as soon as payment is confirmed.</p>
      </div>

      <div className="balance-card">
        <span className="balance-label">Current balance</span>
        <h2 className="balance-amount">{formatCurrency(balance)}</h2>
      </div>

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

      {/* STEP 2: TRANSFER INSTRUCTIONS */}
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
            <div>
              <h3 className="card-title">Transfer instructions</h3>
              <span className="card-sub">
                Test payment — no real money moves.
              </span>
            </div>
          </div>

          <div className="transfer-amount-box">
            <span className="transfer-label">Amount to transfer</span>
            <h2 className="transfer-value">{formatCurrency(amount || 0)}</h2>
          </div>

          <div className="details-list">
            <div className="detail-item">
              <span className="detail-label">Bank</span>
              <div className="detail-val-row">
                <span className="bank-icon-badge">
                  <FaBuildingColumns aria-hidden="true" />
                </span>
                <strong className="detail-value">{bankDetails.bankName}</strong>
              </div>
            </div>

            <div className="detail-item">
              <span className="detail-label">Account number</span>
              <div className="detail-val-row space-between">
                <strong className="detail-value bold">
                  {bankDetails.accountNumber}
                </strong>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={handleCopyAccount}
                >
                  {copied ? <FiCheck className="copied-icon" /> : <FiCopy />}
                </button>
              </div>
            </div>

            <div className="detail-item">
              <span className="detail-label">Account name</span>
              <strong className="detail-value">
                {bankDetails.accountName}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="primary-btn"
            onClick={handleConfirmPayment}
          >
            I've made the payment <FiArrowRight />
          </button>

          <p className="disclaimer-text">
            In test mode we simulate verification instantly. With a live
            provider connected, your wallet only updates after a verified
            payment confirmation.
          </p>
        </div>
      )}

      {/* STEP 3: VERIFYING LOADER */}
      {step === 3 && (
        <div className="deposit-card processing-card">
          <div className="spinner-wrap">
            <FiLoader className="spin-icon" />
          </div>
          <h3 className="processing-title">Verifying Payment</h3>
          <p className="processing-desc">
            Please wait while we confirm your transfer...
          </p>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 4 && (
        <div className="success-flow">
          <div className="success-card">
            <div className="success-badge">
              <FiCheckCircle />
            </div>
            <h3 className="success-title">Payment successful</h3>
            <h2 className="success-amount">{formatCurrency(amount || 0)}</h2>
            <div className="wallet-updated-chip">
              <FiCheck /> Wallet updated
            </div>
            <span className="ref-text">Reference: {transactionRef}</span>
            <span className="test-chip">TEST TRANSACTION</span>
          </div>

          <div className="new-balance-card">
            <span className="new-bal-label">New wallet balance</span>
            <h2 className="new-bal-val">{formatCurrency(balance)}</h2>
          </div>

          <div className="action-row">
            <button type="button" className="secondary-btn flex-1">
              View transactions
            </button>
            <button type="button" className="primary-btn flex-1">
              Buy a number
            </button>
          </div>

          <div className="reset-wrap">
            <button type="button" className="link-btn" onClick={handleReset}>
              Make another test deposit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
