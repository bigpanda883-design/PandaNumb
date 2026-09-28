import { useEffect, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiCopy,
  FiRefreshCw,
  FiMessageSquare,
  FiCheckCircle,
  FiLoader,
  FiZap,
} from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { pushNotification } from "../notifications/notificationStore";
import { useVerificationCode } from "../hooks/useVerificationCode";
import {
  getActivations,
  recordCode,
  updateActivationStatus,
  NUMBER_STATUS,
  subscribeToActivations,
} from "../wallet/activationStore";
import { usePageLoading } from "../hooks/usePageLoading";
import { MyNumbersSkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/MyNumbers.css";

// No hardcoded number list: a user's numbers come from the backend only.

function MyNumbers() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoading: isLoadingList } = usePageLoading();

  // Navigation view state: null = List View, object = Detail View
  const [selectedNumber, setSelectedNumber] = useState(null);

  // Numbers issued by the provider, from the activation store.
  const [numbersList, setNumbersList] = useState(getActivations);
  const [listError] = useState(null);

  // Verification state for selected item
  const [verificationCode, setVerificationCode] = useState(null);
  const [copiedType, setCopiedType] = useState(null);

  // When opening a specific number card
  const handleSelectNumber = (item) => {
    setSelectedNumber(item);
    if (item.codeReceived) {
      setVerificationCode({
        code: item.verificationCode,
        receivedTime: item.codeReceivedTime,
      });
    } else {
      setVerificationCode(null);
    }
  };

  // Back to numbers list
  const handleBackToList = () => {
    setSelectedNumber(null);
    setVerificationCode(null);
    setCopiedType(null);

    // Clear the router state too, otherwise a refresh would re-open the
    // detail view we just left.
    navigate("/my-numbers", { replace: true, state: null });
  };

  // Poll the provider for the code belonging to the selected activation.
  const {
    code: liveCode,
    receivedAt: liveCodeTime,
    isPolling,
    error: codeError,
    startPolling,
    cancel,
  } = useVerificationCode(selectedNumber?.id ?? null);

  // Keep the list in sync with the store.
  useEffect(() => {
    return subscribeToActivations(setNumbersList);
  }, []);

  // When the provider delivers a code, persist it and notify. The state update
  // is deferred so the effect body itself does not set state during the commit.
  useEffect(() => {
    if (!liveCode || !selectedNumber) return;

    Promise.resolve().then(() => {
      setVerificationCode({
        code: liveCode,
        receivedTime: liveCodeTime
          ? liveCodeTime.toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : "",
      });
    });

    recordCode(selectedNumber.id, liveCode, liveCodeTime || new Date());
    updateActivationStatus(selectedNumber.id, NUMBER_STATUS.CODE_RECEIVED);

    pushNotification({
      type: "code",
      title: "Verification code received",
      description: `${selectedNumber.service} code ${liveCode} arrived.`,
      path: "/my-numbers",
    });
  }, [liveCode, liveCodeTime, selectedNumber]);

  // If a previously stored activation already has its code, show it.
  useEffect(() => {
    if (!selectedNumber) return;
    const stored = getActivations().find(
      (a) => a.activationId === selectedNumber.id,
    );
    if (stored?.code) {
      Promise.resolve().then(() => {
        setVerificationCode({
          code: stored.code,
          receivedTime: stored.receivedAt
            ? new Date(stored.receivedAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : "",
        });
      });
    }
  }, [selectedNumber]);

  // A completed purchase arrives with the new number in router state. Open its
  // Verification Codes view immediately, then clear the state so going back or
  // refreshing lands on the normal list.
  useEffect(() => {
    const purchasedNumber = location.state?.openNumber;
    if (!purchasedNumber) return;

    Promise.resolve().then(() => handleSelectNumber(purchasedNumber));
    navigate(location.pathname, { replace: true, state: null });
    // Run only when the incoming state changes (i.e. right after a purchase).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Handle "Get Code" - start polling the provider for the real SMS code.
  const handleGetCode = () => {
    if (!selectedNumber) return;
    startPolling();
  };

  // Cancel the activation and refund it with the provider.
  const handleCancelNumber = async () => {
    try {
      await cancel();
      updateActivationStatus(selectedNumber.id, NUMBER_STATUS.CANCELLED);
      pushNotification({
        type: "purchase",
        title: "Number cancelled",
        description: `${selectedNumber.service} number ${selectedNumber.number} was released and refunded.`,
        path: "/my-numbers",
      });
      handleBackToList();
    } catch {
      // The provider refused the cancel; leave the number as it is.
    }
  };

  // Copy helper
  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Loading the list: the skeleton supplies its own page shell, so return it
  // before the real (nested) wrapper to avoid compounding two page wrappers.
  if (isLoadingList) {
    return <MyNumbersSkeleton />;
  }

  return (
    <div className="mynumbers-page-wrapper">
      <div className="mynumbers-container">
        {/* VIEW 1: NUMBERS LIST */}
        {!selectedNumber ? (
          <div className="numbers-list-view">
            <div className="list-header">
              <h1 className="main-title">My numbers</h1>
              <p className="main-subtitle">
                Open a number to read its verification codes.
              </p>
            </div>

            <div className="numbers-cards-flex">
              {listError ? (
                <div className="empty-state">
                  <strong>Could not load your numbers</strong>
                  <span>{listError.message}</span>
                </div>
              ) : numbersList.length === 0 ? (
                <div className="empty-state">
                  <strong>No numbers yet</strong>
                  <span>
                    Buy a number and it will appear here with its verification
                    codes.
                  </span>
                </div>
              ) : (
                numbersList.map((item) => (
                  <div
                  key={item.id}
                  className="number-item-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectNumber(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectNumber(item);
                    }
                  }}
                >
                  <div className="item-card-left">
                    <div className="country-circle-badge">
                      {item.countryCode.toUpperCase()}
                    </div>
                    <div className="item-info">
                      <div className="phone-number-title">{item.number}</div>
                      <div className="phone-details-sub">
                        {item.countryName} · {item.service} · {item.dateStr}
                      </div>
                      <div className="status-tag-row">
                        <span className="badge-code-received-light">
                          CODE RECEIVED
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="item-card-right">
                    <div className="item-price">{item.price}</div>
                    <div className="status-pill-completed">{item.status}</div>
                    <FiChevronRight className="chevron-icon" />
                  </div>
                </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* VIEW 2: VERIFICATION CODES DETAIL VIEW */
          <div className="number-details-view">
            {/* HEADER TITLE */}
            <div className="mynumbers-header">
              <button
                type="button"
                className="back-circle-btn"
                onClick={handleBackToList}
                aria-label="Go back"
              >
                <FiChevronLeft />
              </button>
              <h1 className="mynumbers-title">Verification codes</h1>
            </div>

            {/* BLUE PURCHASED NUMBER CARD */}
            <div className="number-card-banner">
              <div className="card-top-flex">
                <div className="card-left-meta">
                  <div className="card-service-meta">
                    <span className="country-tag">
                      {selectedNumber.countryCode}
                    </span>{" "}
                    <span className="service-tag">
                      {selectedNumber.service} number
                    </span>
                  </div>
                  <div className="phone-number-display">
                    {selectedNumber.number}
                  </div>
                  <div className="card-sub-info">
                    {selectedNumber.price} · {selectedNumber.dateStr} ·{" "}
                    {selectedNumber.orderId}
                  </div>
                </div>

                <button
                  type="button"
                  className="copy-card-btn"
                  onClick={() => handleCopy(selectedNumber.number, "phone")}
                >
                  <FiCopy />
                  <span>{copiedType === "phone" ? "Copied!" : "Copy"}</span>
                </button>
              </div>

              <div className="card-status-badge">
                {verificationCode ? (
                  <span className="badge-code-received-dark">
                    <FiCheckCircle /> CODE RECEIVED
                  </span>
                ) : (
                  <span className="badge-ready">
                    <FiZap aria-hidden="true" />
                    <span>READY</span>
                  </span>
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
                  Use this number on the service you selected, then tap Get code
                  to receive your verification SMS.
                </p>

                <button
                  type="button"
                  className="get-code-btn"
                  disabled={isPolling}
                  onClick={handleGetCode}
                >
                  {isPolling ? (
                    <>
                      <FiLoader className="spin-icon" />
                      <span>Waiting for code...</span>
                    </>
                  ) : codeError ? (
                    "Retry"
                  ) : (
                    "Get code"
                  )}
                </button>

                {/* The provider refused the request - explain why. */}
                {codeError && (
                  <p className="code-error-text" role="alert">
                    {codeError.message}
                  </p>
                )}

                <button
                  type="button"
                  className="cancel-number-btn"
                  onClick={handleCancelNumber}
                >
                  Cancel number and refund
                </button>
              </div>
            ) : (
              /* STATE 2: CODE RECEIVED */
              <div className="code-received-panel">
                <div className="received-card-header">
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
                  {selectedNumber.service}: {verificationCode.code} is your
                  verification code. Do not share it with anyone.
                </p>

                <span className="sms-timestamp">
                  {verificationCode.receivedTime}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MyNumbers;
