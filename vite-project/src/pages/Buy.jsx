import { useEffect, useMemo, useState } from "react";
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
import { setBalance } from "../wallet/walletStore";
import { addTransaction, TRANSACTION_TYPES } from "../wallet/transactionStore";
import { addActivation } from "../wallet/activationStore";
import { getNumbersStatus } from "../services/smsProvider";
import { purchaseNumber } from "../services/numbersApi";
import { useCatalogue } from "../services/accPrices";
import { getAppIdentity } from "../config/appCatalog";
import { buildCountryList } from "../config/countryCatalog";
import { useBalance } from "../hooks/useBalance";
import { BuySkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/Buy.css";

function getProviderStockCount(stock, serviceId) {
  if (!stock || typeof stock !== "object" || !serviceId) return null;
  if (!Object.hasOwn(stock, serviceId)) return null;

  const count = Number(stock[serviceId]);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function Buy() {
  const navigate = useNavigate();
  const { animatedBalance } = useBalance();

  const {
    catalogue,
    isLoading: isLoadingCatalogue,
    error: catalogueError,
    retry: retryCatalogue,
  } = useCatalogue();

  const [step, setStep] = useState(1);
  const [selectedAppService, setSelectedAppService] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  const [providerStock, setProviderStock] = useState(null);
  const [isLoadingProviderStock, setIsLoadingProviderStock] = useState(false);
  const [providerStockError, setProviderStockError] = useState(null);
  const [providerStockRefresh, setProviderStockRefresh] = useState(0);

  const allCountries = useMemo(() => buildCountryList(catalogue), [catalogue]);
  const canBuyAtAll = true;

  const SERVICE_OFFER_OPTIONS = {
    whatsapp: [
      {
        id: "voucher",
        label: "Voucher",
        sellingPrice: 3200,
        providerProductId: "voucher",
      },
      {
        id: "all-countries",
        label: "All Countries",
        sellingPrice: 4200,
        providerProductId: "all-countries",
      },
    ],
    telegram: [
      {
        id: "fresh",
        label: "Fresh / New",
        sellingPrice: 3000,
        providerProductId: "fresh",
      },
      {
        id: "used",
        label: "Used / Open",
        sellingPrice: 5715,
        providerProductId: "used",
      },
    ],
  };

  const catalogueServices = useMemo(() => {
    if (!catalogue?.countries) return [];
    const serviceIds = new Set();
    Object.values(catalogue.countries).forEach((country) => {
      Object.values(country.services || {}).forEach((entry) => {
        if (entry.serviceId) serviceIds.add(entry.serviceId);
      });
    });

    return [...serviceIds]
      .map((id) => ({ id, ...getAppIdentity(id) }))
      .sort((left, right) => {
        const priority = ["whatsapp", "facebook", "telegram", "instagram"];
        const leftRank = priority.indexOf(left.id);
        const rightRank = priority.indexOf(right.id);
        const rankDifference =
          (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank) -
          (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank);
        return rankDifference || left.label.localeCompare(right.label);
      });
  }, [catalogue]);

  const countries = useMemo(() => {
    if (!catalogue || !selectedAppService) return allCountries;
    return allCountries.filter((country) => {
      const services = catalogue.countries?.[country.slug]?.services || {};
      return Object.values(services).some(
        (entry) => entry.serviceId === selectedAppService.id,
      );
    });
  }, [allCountries, catalogue, selectedAppService]);

  const filteredCountries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return countries;
    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(q) ||
        (country.dial && country.dial.includes(q)) ||
        (country.iso && country.iso.toLowerCase().includes(q)),
    );
  }, [countries, searchQuery]);

  const filteredServices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return catalogueServices;
    return catalogueServices.filter((service) =>
      service.label.toLowerCase().includes(q),
    );
  }, [catalogueServices, searchQuery]);

  const serviceOptions = selectedAppService?.id
    ? SERVICE_OFFER_OPTIONS[selectedAppService.id] || []
    : [];

  useEffect(() => {
    if (!selectedAppService) {
      setSelectedOffer(null);
      return;
    }

    if (serviceOptions.length === 0) {
      setSelectedOffer(null);
      return;
    }

    setSelectedOffer((current) => {
      if (
        !current ||
        !serviceOptions.some((option) => option.id === current.id)
      ) {
        return serviceOptions[0];
      }
      return current;
    });
  }, [selectedAppService, serviceOptions]);

  useEffect(() => {
    if (!selectedCountry?.providerId) {
      setProviderStock(null);
      setProviderStockError(null);
      setIsLoadingProviderStock(false);
      return undefined;
    }

    const controller = new AbortController();
    setProviderStock(null);
    setProviderStockError(null);
    setIsLoadingProviderStock(true);

    getNumbersStatus(selectedCountry.providerId, { signal: controller.signal })
      .then((stock) => {
        if (!controller.signal.aborted) setProviderStock(stock);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.name !== "AbortError") {
          setProviderStockError(error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingProviderStock(false);
      });

    return () => controller.abort();
  }, [selectedCountry, providerStockRefresh]);

  const purchasePrice = Number(selectedOffer?.sellingPrice || 0);
  const availableBalance = Number(animatedBalance || 0);
  const shortfall = Math.max(0, purchasePrice - availableBalance);
  const hasKnownPrice = Number.isFinite(purchasePrice) && purchasePrice > 0;
  const hasInsufficientFunds = hasKnownPrice && shortfall > 0;

  const providerStockKey =
    selectedOffer?.providerProductId || selectedAppService?.id;
  const providerCount = providerStockKey
    ? getProviderStockCount(providerStock, providerStockKey)
    : null;
  const stockCount = providerCount ?? 0;
  const isOutOfStock =
    providerCount === 0 ||
    (providerStock &&
      Object.keys(providerStock).length > 0 &&
      providerCount === null);

  const handleBack = () => {
    setPurchaseError(null);
    setSearchQuery("");

    if (step === 1) {
      navigate("/dashboard");
      return;
    }

    if (step === 2) {
      setSelectedAppService(null);
      setSelectedCountry(null);
      setSelectedOffer(null);
      setStep(1);
      return;
    }

    if (step === 3) {
      setSelectedCountry(null);
      setSelectedOffer(null);
      setStep(2);
    }
  };

  const handleSelectAppService = (service) => {
    setSelectedAppService(service);
    setSelectedCountry(null);
    setSelectedOffer(null);
    setPurchaseError(null);
    setSearchQuery("");
    setStep(2);
  };

  const handleSelectCountry = (country) => {
    setSelectedCountry(country);
    setSelectedOffer(null);
    setPurchaseError(null);
    setSearchQuery("");
    setStep(3);
  };

  const handleOfferSelect = (offer) => {
    setSelectedOffer(offer);
    setPurchaseError(null);
  };

  const mapProviderError = (error) => {
    if (!error) return "Failed to purchase number. Please try again.";
    return error.message || "Failed to purchase number. Please try again.";
  };

  const handleConfirmPurchase = async () => {
    if (isSubmitting) return;
    if (hasInsufficientFunds || isLoadingProviderStock || providerStockError)
      return;
    if (!hasKnownPrice || !selectedCountry || !selectedOffer) return;

    const countryCode = selectedCountry?.providerId;
    if (!countryCode || !selectedAppService?.id) return;
    if (isOutOfStock) return;

    setIsSubmitting(true);
    setPurchaseError(null);

    try {
      // Buy through OUR backend: it resolves the provider's service code, debits
      // the wallet server-side, records the transaction and returns the real
      // number the provider issued. The browser never debits its own balance.
      const { number, balance, transaction } = await purchaseNumber({
        serviceId: selectedAppService.id,
        countryCode,
        serviceName: selectedAppService.label,
        countryName: selectedCountry.name,
        price: purchasePrice,
      });

      if (!number?.number || !number?.id) {
        throw new Error(
          "The server did not return a number for this purchase.",
        );
      }

      // Mirror the server's records into the local stores the UI reads from.
      addActivation({
        activationId: number.id,
        phone: number.number,
        service: number.service,
        country: number.countryName,
        price: number.priceValue ?? purchasePrice,
      });

      const purchasedNumber = {
        id: number.id,
        number: number.number,
        countryCode: number.countryCode || "",
        countryName: number.countryName,
        service: number.service,
        price: number.price,
        orderId: number.orderId,
        status: number.status || "WAITING",
        codeReceived: false,
        dateStr: number.dateStr,
      };

      // The backend is the source of truth for the balance.
      const nextBalance = Number(balance);
      if (Number.isFinite(nextBalance)) {
        setBalance(nextBalance, "purchase");
      }

      addTransaction({
        type: TRANSACTION_TYPES.PURCHASE,
        title:
          transaction?.title ||
          `${purchasedNumber.service} number ${purchasedNumber.number}`,
        amount: -purchasePrice,
        path: "/my-numbers",
        reference: transaction?.reference || number.id,
      });

      pushNotification({
        type: "purchase",
        title: "Number purchased",
        description: `${purchasedNumber.service} number ${purchasedNumber.number} is ready.`,
        path: "/my-numbers",
      });

      setIsSubmitting(false);
      navigate("/my-numbers", { state: { openNumber: purchasedNumber } });
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
              {step === 1
                ? "Service"
                : step === 2
                  ? "Country"
                  : "Offer & purchase"}
            </span>
          </div>
        </div>

        <div className="buy-progress-bar">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className={`progress-segment ${step >= index + 1 ? "active" : ""}`}
            />
          ))}
        </div>
      </header>

      {step === 1 && (
        <div className="buy-step-content slide-up-anim">
          <h2 className="step-subtitle">Choose a service</h2>

          <div className="country-search-bar">
            <FiSearch className="search-icon" />
            <input
              type="search"
              placeholder="Search service"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="services-grid">
            {filteredServices.map((service, index) => {
              const Icon = service.Icon;
              return (
                <button
                  key={service.id}
                  type="button"
                  className="service-card"
                  style={{ animationDelay: `${index * 0.02}s` }}
                  onClick={() => handleSelectAppService(service)}
                >
                  <span className="service-icon-wrapper">
                    <Icon color={service.color} aria-hidden="true" />
                  </span>
                  <span className="service-details">
                    <span className="service-name">{service.label}</span>
                    <span className="service-countries-count">
                      Select to choose a country
                    </span>
                  </span>
                </button>
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

      {step === 2 && selectedAppService && (
        <div className="buy-step-content slide-up-anim">
          <h2 className="step-subtitle">
            Choose a country for {selectedAppService.label}
          </h2>

          <div className="country-search-bar">
            <FiSearch className="search-icon" />
            <input
              type="search"
              placeholder="Search country or dialling code"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="countries-list">
            {filteredCountries.map((country, index) => (
              <button
                key={country.slug}
                type="button"
                className="country-card"
                style={{ animationDelay: `${index * 0.02}s` }}
                disabled={!country.canPurchase}
                onClick={() => handleSelectCountry(country)}
              >
                <div className="country-info">
                  {country.flagUrl && (
                    <img
                      src={country.flagUrl}
                      alt=""
                      className="country-flag-img"
                    />
                  )}
                  <div className="country-text">
                    <span className="country-name">{country.name}</span>
                    <span className="country-subtext">
                      {country.dial ? `${country.dial} · ` : ""}
                      {country.canPurchase
                        ? "check live inventory"
                        : "country code unavailable"}
                    </span>
                  </div>
                </div>
              </button>
            ))}

            {filteredCountries.length === 0 && (
              <div className="no-results">
                No countries with {selectedAppService.label} catalogue entries
                found for "{searchQuery}".
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && selectedAppService && selectedCountry && (
        <div className="buy-step-content slide-up-anim">
          <div className="confirm-card">
            <h2 className="confirm-title">{selectedAppService.label}</h2>

            {serviceOptions.length > 0 && (
              <div
                className="offer-toggle-group"
                role="tablist"
                aria-label="Choose an offer type"
              >
                {serviceOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`offer-toggle${selectedOffer?.id === option.id ? " active" : ""}`}
                    onClick={() => handleOfferSelect(option)}
                  >
                    <span>{option.label}</span>
                    <span>₦{Number(option.sellingPrice).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}

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
              <span className="confirm-label">Offer</span>
              <span className="confirm-value">
                {selectedOffer ? selectedOffer.label : "Select an offer"}
              </span>
            </div>

            <div className="confirm-row">
              <span className="confirm-label">Available stock</span>
              <span className="confirm-value">
                {isLoadingProviderStock
                  ? "Checking provider inventory..."
                  : providerStockError
                    ? "Inventory unavailable"
                    : providerCount === null
                      ? "No stock data"
                      : `${stockCount} numbers`}
              </span>
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

          {providerStockError && (
            <div className="purchase-error-card" role="alert">
              <p className="insufficient-text">
                Could not check provider inventory: {providerStockError.message}
              </p>
            </div>
          )}

          {providerCount === 0 &&
            !providerStockError &&
            !isLoadingProviderStock && (
              <div className="purchase-error-card" role="alert">
                <p className="insufficient-text">
                  No live numbers are available for this{" "}
                  {selectedAppService.label} offer in {selectedCountry.name}{" "}
                  right now.
                </p>
              </div>
            )}

          {hasInsufficientFunds && (
            <div className="insufficient-funds-card" role="alert">
              <div className="insufficient-header">
                <FiAlertCircle className="insufficient-icon" />
                <h3>Insufficient funds</h3>
              </div>
              <p className="insufficient-text">
                Your balance is not enough to complete this purchase.
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
                isLoadingProviderStock ||
                Boolean(providerStockError) ||
                isOutOfStock ||
                !canBuyAtAll ||
                !selectedOffer ||
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
            <FaShieldHalved className="shield-icon" />
            Balance is verified on our servers before you are charged.
          </p>
        </div>
      )}
    </section>
  );
}

export default Buy;
