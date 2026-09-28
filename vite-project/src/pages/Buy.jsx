import { useMemo, useState } from "react";
import {
  FiChevronLeft,
  FiSearch,
  FiCheck,
  FiLoader,
  FiAlertCircle,
  FiPlus,
  FiRefreshCw,
} from "react-icons/fi";
import { FaShieldHalved } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import { pushNotification } from "../notifications/notificationStore";
import { debitBalance } from "../wallet/walletStore";
import { addTransaction, TRANSACTION_TYPES } from "../wallet/transactionStore";
import { addActivation } from "../wallet/activationStore";
import { requestNumber } from "../services/smsProvider";
import { useCatalogue } from "../services/accPrices";
import { getAppIdentity } from "../config/appCatalog";
import { buildCountryList, hasProviderMapping } from "../config/countryCatalog";
import { useBalance } from "../hooks/useBalance";
import { BuySkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/Buy.css";

function Buy() {
  const navigate = useNavigate();
  const { animatedBalance } = useBalance();

  // Fetch real catalogue from ACC Numbers API
  const {
    catalogue,
    isLoading: isLoadingCatalogue,
    error: catalogueError,
    retry: retryCatalogue,
  } = useCatalogue();

  const [step, setStep] = useState(1);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);

  const canBuyAtAll = hasProviderMapping();
  const countries = useMemo(() => buildCountryList(catalogue), [catalogue]);

  // Dynamically map ALL available services for selected country
  const services = useMemo(() => {
    if (!catalogue || !selectedCountry) return [];
    const country = catalogue.countries?.[selectedCountry.slug];
    if (!country) return [];

    return Object.values(country.services)
      .map((entry) => ({
        ...entry,
        ...getAppIdentity(entry.id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogue, selectedCountry]);

  // Search filtering over real countries
  const filteredCountries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.dial && c.dial.includes(q)) ||
        (c.iso && c.iso.toLowerCase().includes(q)),
    );
  }, [countries, searchQuery]);

  // Search filtering over real API services
  const filteredServices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return services;
    return services.filter((s) => s.label.toLowerCase().includes(q));
  }, [services, searchQuery]);

  const hasKnownPrice =
    selectedService != null && Number.isFinite(selectedService.cost);

  const purchasePrice = hasKnownPrice ? Number(selectedService.cost) : 0;
  const availableBalance = Number(animatedBalance || 0);
  const shortfall = Math.max(0, purchasePrice - availableBalance);
  const hasInsufficientFunds =
    hasKnownPrice && purchasePrice > 0 && shortfall > 0;

  const stockCount = selectedService?.count ?? 0;
  const isOutOfStock = stockCount <= 0;

  const handleBack = () => {
    setPurchaseError(null);
    setSearchQuery("");
    if (step > 1) {
      setStep((prev) => prev - 1);
    } else {
      navigate("/dashboard");
    }
  };

  const handleSelectService = (service) => {
    setSelectedService(service);
    setSearchQuery("");
    setStep(3);
  };

  const handleSelectCountry = (country) => {
    setSelectedCountry(country);
    setSelectedService(null);
    setPurchaseError(null);
    setSearchQuery("");
    setStep(2);
  };

  // `smsProvider` already maps every provider token to a user-facing sentence
  // and exposes the token as `error.code`, so there is nothing to re-invent here.
  // Re-wording it locally is how NO_BALANCE came to be shown as "out of stock"
  // when the truth was that the provider account had no credit - two different
  // problems, and the wrong one sends the operator looking in the wrong place.
  const mapProviderError = (error) => {
    if (!error) return "Failed to purchase number. Please try again.";
    return error.message || "Failed to purchase number. Please try again.";
  };

  const handleConfirmPurchase = async () => {
    if (isSubmitting) return;

    if (hasInsufficientFunds || isOutOfStock || !hasKnownPrice) return;
    if (!canBuyAtAll) return;

    // The provider id is the ONLY id Yankee Verify accepts for a country. Falling
    // back to the ISO code would send e.g. "US" where a numeric id is required
    // and buy from an arbitrary country, so a missing mapping stops the purchase.
    const countryCode = selectedCountry?.providerId;
    // The variant id ("whatsapp_virtual28"), not the bare service name: the
    // provider refuses the un-suffixed form.
    const serviceCode = selectedService?.id;

    if (!countryCode || !serviceCode) return;

    setIsSubmitting(true);
    setPurchaseError(null);

    const price = Number(selectedService.cost);

    try {
      // The backend owns the action name and the API key; only the two real
      // arguments are sent from here.
      const { activationId, phone } = await requestNumber({
        service: serviceCode,
        country: countryCode,
      });

      if (!activationId || !phone) {
        throw new Error("Invalid activation response from server.");
      }

      // Track activation record with real activation ID
      const activation = addActivation({
        activationId,
        phone,
        service: selectedService.label,
        country: selectedCountry.name,
        price,
      });

      const purchasedNumber = {
        id: activationId,
        number: phone,
        countryCode: selectedCountry.iso
          ? selectedCountry.iso.toLowerCase()
          : "",
        countryName: selectedCountry.name,
        service: selectedService.label,
        price: `₦${price.toLocaleString()}`,
        orderId: activationId,
        status: "WAITING",
        codeReceived: false,
        dateStr: activation?.dateStr,
      };

      // Deduct wallet balance and log transactions
      debitBalance(price, "purchase");

      addTransaction({
        type: TRANSACTION_TYPES.PURCHASE,
        title: `${purchasedNumber.service} number ${purchasedNumber.number}`,
        amount: -price,
        path: "/my-numbers",
        reference: activationId,
      });

      pushNotification({
        type: "purchase",
        title: "Number purchased",
        description: `${purchasedNumber.service} number ${purchasedNumber.number} is ready.`,
        path: "/my-numbers",
      });

      setIsSubmitting(false);

      navigate("/my-numbers", {
        state: { openNumber: purchasedNumber },
      });
    } catch (error) {
      setIsSubmitting(false);
      setPurchaseError({ message: mapProviderError(error) });
    }
  };

  if (isLoadingCatalogue) {
    return <BuySkeleton />;
  }

  if (catalogueError) {
    return (
      <section className="buy-flow-container">
        <div className="buy-step-content">
          <div className="purchase-error-card" role="alert">
            <div className="insufficient-header">
              <FiAlertCircle className="insufficient-icon" />
              <h3>Unable to load services</h3>
            </div>
            <p className="insufficient-text">
              {catalogueError.message ||
                "The service catalogue could not be loaded."}
            </p>
            <button
              type="button"
              className="insufficient-fund-btn"
              onClick={retryCatalogue}
            >
              <FiRefreshCw aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="buy-flow-container">
      <header className="buy-header">
        <div className="buy-header-left">
          <button
            type="button"
            className="buy-back-btn"
            onClick={handleBack}
            aria-label="Go back"
          >
            <FiChevronLeft />
          </button>
          <div className="buy-title-group">
            <h1 className="buy-main-title">Buy a number</h1>
            <span className="buy-step-indicator">
              Step {step} of 3 ·{" "}
              {step === 1 ? "Country" : step === 2 ? "Service" : "Confirm"}
            </span>
          </div>
        </div>

        <div className="buy-progress-bar">
          <div className={`progress-segment ${step >= 1 ? "active" : ""}`} />
          <div className={`progress-segment ${step >= 2 ? "active" : ""}`} />
          <div className={`progress-segment ${step >= 3 ? "active" : ""}`} />
        </div>
      </header>

      {!canBuyAtAll && (
        <div className="purchase-error-card" role="alert">
          <p className="insufficient-text">
            Country mapping is not configured, so purchases are disabled. Set
            VITE_YANKEE_COUNTRY_MAP to enable buying.
          </p>
        </div>
      )}

      {/* STEP 1: Choose Country */}
      {step === 1 && (
        <div className="buy-step-content slide-up-anim">
          <h2 className="step-subtitle">Choose a country</h2>

          <div className="country-search-bar">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search country or dialling code"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="countries-list">
            {filteredCountries.map((ctry, idx) => (
              <div
                key={ctry.slug}
                className="country-card"
                style={{ animationDelay: `${idx * 0.02}s` }}
                onClick={() => handleSelectCountry(ctry)}
              >
                <div className="country-info">
                  {ctry.flagUrl && (
                    <img
                      src={ctry.flagUrl}
                      alt={ctry.name}
                      className="country-flag-img"
                    />
                  )}
                  <div className="country-text">
                    <span className="country-name">{ctry.name}</span>
                    <span className="country-subtext">
                      {ctry.dial ? `${ctry.dial} · ` : ""}
                      {ctry.canPurchase ? "instant delivery" : "unavailable"}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {filteredCountries.length === 0 && (
              <div className="no-results">
                No countries found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Choose Service */}
      {step === 2 && (
        <div className="buy-step-content slide-up-anim">
          <h2 className="step-subtitle">
            Choose a service for {selectedCountry?.name}
          </h2>

          <div className="country-search-bar">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search service"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="services-grid">
            {filteredServices.map((srv, idx) => {
              const inStock = srv.count > 0;
              return (
                <div
                  key={srv.id}
                  className={`service-card${inStock ? "" : " service-card-disabled"}`}
                  style={{ animationDelay: `${idx * 0.02}s` }}
                  onClick={inStock ? () => handleSelectService(srv) : undefined}
                  aria-disabled={!inStock}
                >
                  <div className="service-icon-wrapper">
                    <srv.Icon color={srv.color} />
                  </div>
                  <div className="service-details">
                    <h3 className="service-name">{srv.label}</h3>
                    <span className="service-price">
                      {srv.cost === null
                        ? "Price unavailable"
                        : `₦${srv.cost.toLocaleString()}`}
                    </span>
                    <span className="service-countries-count">
                      {inStock ? `${srv.count} in stock` : "Unavailable"}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredServices.length === 0 && (
              <div className="no-results">
                No services found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Confirm Order */}
      {step === 3 && selectedService && selectedCountry && (
        <div className="buy-step-content slide-up-anim">
          <div className="confirm-card">
            <h2 className="confirm-title">Order summary</h2>

            <div className="confirm-row">
              <span className="confirm-label">Service</span>
              <span className="confirm-value font-bold flex-align-center">
                <span className="confirm-app-logo">
                  <selectedService.Icon color={selectedService.color} />
                </span>
                {selectedService.label}
              </span>
            </div>

            <div className="confirm-row">
              <span className="confirm-label">Country</span>
              <span className="confirm-value font-bold flex-align-center">
                {selectedCountry.flagUrl && (
                  <img
                    src={selectedCountry.flagUrl}
                    alt={selectedCountry.name}
                    className="country-flag-img-sm"
                  />
                )}
                {selectedCountry.name}
                {selectedCountry.dial ? ` (${selectedCountry.dial})` : ""}
              </span>
            </div>

            <div className="confirm-row">
              <span className="confirm-label">Available stock</span>
              <span className="confirm-value">{stockCount} numbers</span>
            </div>

            <hr className="confirm-divider" />

            <div className="confirm-row">
              <span className="confirm-label">Total</span>
              <span className="confirm-price">
                ₦{purchasePrice.toLocaleString()}
              </span>
            </div>

            <div className="confirm-row">
              <span className="confirm-label">Wallet balance</span>
              <span className="confirm-balance">
                {new Intl.NumberFormat("en-NG", {
                  style: "currency",
                  currency: "NGN",
                  minimumFractionDigits: 2,
                }).format(animatedBalance || 0)}
              </span>
            </div>
          </div>

          {hasInsufficientFunds && (
            <div className="insufficient-funds-card" role="alert">
              <div className="insufficient-header">
                <FiAlertCircle className="insufficient-icon" />
                <h3>Insufficient funds</h3>
              </div>
              <p className="insufficient-text">
                Your balance is not enough to complete this purchase. Please
                fund your wallet to continue.
              </p>
              <p className="insufficient-shortfall">
                Add{" "}
                <strong>
                  {new Intl.NumberFormat("en-NG", {
                    style: "currency",
                    currency: "NGN",
                    minimumFractionDigits: 2,
                  }).format(shortfall)}
                </strong>{" "}
                to complete this purchase.
              </p>
              <button
                type="button"
                className="insufficient-fund-btn"
                onClick={() => navigate("/deposit")}
              >
                <FiPlus aria-hidden="true" />
                Fund wallet
              </button>
            </div>
          )}

          {purchaseError && (
            <div className="purchase-error-card" role="alert">
              <div className="insufficient-header">
                <FiAlertCircle className="insufficient-icon" />
                <h3>Could not complete the purchase</h3>
              </div>
              <p className="insufficient-text">{purchaseError.message}</p>
              <button
                type="button"
                className="insufficient-fund-btn"
                onClick={handleConfirmPurchase}
              >
                Retry
              </button>
            </div>
          )}

          {!hasInsufficientFunds && hasKnownPrice && purchasePrice > 0 && (
            <button
              type="button"
              className="confirm-submit-btn"
              disabled={
                isSubmitting ||
                !canBuyAtAll ||
                (!selectedCountry?.providerId && !selectedCountry?.iso)
              }
              onClick={handleConfirmPurchase}
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="spinner-icon" />
                  <span>Buying number...</span>
                </>
              ) : (
                <>
                  <FiCheck className="check-icon" />
                  <span>
                    Confirm purchase · ₦{purchasePrice.toLocaleString()}
                  </span>
                </>
              )}
            </button>
          )}

          <p className="balance-verification-notice">
            <FaShieldHalved className="shield-icon" /> Balance is verified on
            our servers before you are charged.
          </p>
        </div>
      )}
    </section>
  );
}

export default Buy;
