import { useState } from "react";
import {
  FiChevronLeft,
  FiCopy,
  FiRefreshCw,
  FiMessageSquare,
  FiCheckCircle,
  FiLoader,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import "../CSS/dashboard/pages/MyNumbers.css";

// Helper function to generate random formatted US number (+1 XXX XXX XXXX)
const generateRandomPhoneNumber = () => {
  const areaCode = Math.floor(100 + Math.random() * 900);
  const prefix = Math.floor(100 + Math.random() * 900);
  const lineNum = Math.floor(1000 + Math.random() * 9000);
  return `+1 ${areaCode} ${prefix} ${lineNum}`;
};

// Helper function to generate random 6-digit OTP code
const generateRandomCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to generate random Order ID
const generateRandomOrderId = () => {
  const hex = Math.random().toString(16).substring(2, 8).toUpperCase();
  return `PN-D000${hex}`;
};

const createPhoneNumberDetails = () => {
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const formattedTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return {
    number: generateRandomPhoneNumber(),
    service: "WhatsApp",
    countryCode: "us",
    price: "₦3,200.00",
    dateStr: `${formattedDate}, ${formattedTime}`,
    orderId: generateRandomOrderId(),
  };
};

function MyNumbers() {
  const navigate = useNavigate();

  // Generated phone number details (State)
  const [phoneNumberDetails] = useState(createPhoneNumberDetails);

  // Verification code state
  const [verificationCode, setVerificationCode] = useState(null);
  const [isFetchingCode, setIsFetchingCode] = useState(false);
  const [copiedType, setCopiedType] = useState(null);

  // Handle "Get Code" Click
  const handleGetCode = () => {
    setIsFetchingCode(true);
    setTimeout(() => {
      const newCode = generateRandomCode();
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const dateStr = now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      setVerificationCode({
        code: newCode,
        receivedTime: `${dateStr}, ${timeStr}`,
      });
      setIsFetchingCode(false);
    }, 1200);
  };

  // Copy helper
  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  if (!phoneNumberDetails) return null;

  return (
    <section className="mynumbers-container">
      {/* HEADER TITLE */}
      <div className="mynumbers-header">
        <button
          type="button"
          className="back-circle-btn"
          onClick={() => navigate("/dashboard")}
          aria-label="Go back"
        >
          <FiChevronLeft />
        </button>
        <h1 className="mynumbers-title">Verification codes</h1>
      </div>

      {/* BLUE PURCHASED NUMBER CARD */}
      <div className="number-card-banner">
        <div className="card-top-row">
          <div className="card-service-meta">
            <span className="country-tag">
              {phoneNumberDetails.countryCode}
            </span>
            <span className="service-tag">
              {phoneNumberDetails.service} number
            </span>
          </div>
          <button
            type="button"
            className="copy-card-btn"
            onClick={() => handleCopy(phoneNumberDetails.number, "phone")}
          >
            <FiCopy />
            <span>{copiedType === "phone" ? "Copied!" : "Copy"}</span>
          </button>
        </div>

        <div className="phone-number-display">{phoneNumberDetails.number}</div>

        <div className="card-sub-info">
          {phoneNumberDetails.price} · {phoneNumberDetails.dateStr} ·{" "}
          {phoneNumberDetails.orderId}
        </div>

        <div className="card-status-badge">
          {verificationCode ? (
            <span className="badge-code-received">
              <FiCheckCircle /> CODE RECEIVED
            </span>
          ) : (
            <span className="badge-ready">⚡ READY · DEMO</span>
          )}
        </div>
      </div>

      {/* INBOX SECTION */}
      <div className="inbox-section-header">
        <h2 className="inbox-title">Inbox</h2>
        <button
          type="button"
          className="refresh-btn"
          onClick={() => {
            if (verificationCode) {
              setVerificationCode(null);
            }
          }}
        >
          <FiRefreshCw />
          <span>Refresh</span>
        </button>
      </div>

      {/* STATE 1: NO CODE YET */}
      {!verificationCode ? (
        <div className="no-codes-panel">
          <div className="chat-bubble-icon">
            <FiMessageSquare />
          </div>
          <h3 className="no-codes-title">No codes yet</h3>
          <p className="no-codes-desc">
            Use this number on the service you selected, then tap Get code to
            receive your simulated verification SMS.
          </p>
          <button
            type="button"
            className="get-code-btn"
            disabled={isFetchingCode}
            onClick={handleGetCode}
          >
            {isFetchingCode ? (
              <>
                <FiLoader className="spin-icon" />
                <span>Fetching code...</span>
              </>
            ) : (
              "Get code"
            )}
          </button>
        </div>
      ) : (
        /* STATE 2: CODE RECEIVED */
        <div className="code-received-panel">
          <div className="received-header font-bold flex-align-center">
            <FiCheckCircle className="check-green-icon" />
            <span>Code received</span>
          </div>

          <div className="code-display-row">
            <div className="spaced-code-digits">
              {verificationCode.code.split("").map((digit, i) => (
                <span key={i} className="digit-char">
                  {digit}
                </span>
              ))}
            </div>

            <button
              type="button"
              className="copy-code-pill-btn"
              onClick={() => handleCopy(verificationCode.code, "code")}
            >
              <FiCopy />
              <span>{copiedType === "code" ? "Copied!" : "Copy"}</span>
            </button>
          </div>

          <p className="sms-message-text">
            {phoneNumberDetails.service}: {verificationCode.code} is your
            verification code. Do not share it with anyone.
          </p>

          <span className="sms-timestamp">{verificationCode.receivedTime}</span>
        </div>
      )}
    </section>
  );
}

export default MyNumbers;
