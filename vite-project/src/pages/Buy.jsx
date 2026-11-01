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
import "../CSS/dashboard/pages/Buy.css";

/**
 * Purchase failures that a second click cannot fix.
 *
 * These come from the provider's ACCOUNT, not from stock or the network:
 *   NO_BALANCE  - the provider wallet has no credit (pay Yankee Verify)
 *   BAD_KEY     - the key we send is invalid/inactive
 *   BANNED      - the provider account is banned
 *   PROVIDER_NOT_CONFIGURED - no key is installed on the server
 * Everything else (NO_NUMBERS, timeouts, 5xx, network) may well succeed on a
 * retry, so only these lose the Retry button.
 */
const NON_RETRYABLE_CODES = new Set([
  "NO_BALANCE",
  "BAD_KEY",
  "BANNED",
  "PROVIDER_NOT_CONFIGURED",
  // Refusals that a second click cannot fix: the server has no price for this
  // service, or the provider cost has risen above what we can charge for it.
  "SERVICE_NOT_SUPPORTED",
  "SERVICE_NOT_PRICED",
  "SERVICE_NOT_AVAILABLE",
  "PRICE_NOT_PROFITABLE",
]);

function getProviderStockCount(stock, serviceId) {
  if (!stock || typeof stock !== "object" || !serviceId) return null;

  // The provider keys stock by service AND its own variant suffix, e.g.
  // "whatsapp_0", "whatsapp_canada_0", "telegram_0". Comparing against the
  // plain id ("whatsapp") or a local offer id ("voucher", "all-countries")
  // never matched, so the page always reported "No stock data" even though
  // numbers were available.
  if (Object.hasOwn(stock, serviceId)) {
    const exact = Number(stock[serviceId]);
    return Number.isFinite(exact) && exact >= 0 ? exact : null;
  }

  // Sum every variant of this service: the user is buying "a number for this
  // service in this country", and any variant can serve that.
  const prefix = `${serviceId.toLowerCase()}_`;
  let total = 0;
  let matched = false;

  for (const [key, value] of Object.entries(stock)) {
    if (!key.toLowerCase().startsWith(prefix)) continue;
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) continue;
    total += count;
    matched = true;
  }

  return matched ? total : null;
}

/**
 * How many service cards are shown before the user types a search.
 *
 * The catalogue contains 1,300+ service ids, most sold in one or two countries.
 * Rendering them all (each with an inline SVG icon) took tens of seconds on a
 * phone. The most widely-sold services are listed first and every service stays
 * reachable by search, so this is a cut in what is *shown*, not in what is
 * available - the search always filters the complete list.
 */
const VISIBLE_SERVICE_LIMIT = 24;

function Buy() {
  const navigate = useNavigate();
  const { animatedBalance } = useBalance();

  const {
    catalogue,
    isLoading: isLoadingCatalogue,
    error: catalogueError,
    isWarmingUp,
    retry: retryCatalogue,
  } = useCatalogue();

  const [step, setStep] = useState(1);
  const [selectedAppService, setSelectedAppService] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  // Stock for the CURRENT selection. `providerStockKeyFetched` says which
  // country+service the value belongs to, so a stale answer for a previous
  // country can never be shown as this one's inventory.
  const [providerStock, setProviderStock] = useState(null);
  const [providerStockKeyFetched, setProviderStockKeyFetched] = useState("");
  // Raw state for the LAST request (which key it was for is what decides
  // whether it is shown); the derived flags below are what the UI reads.
  const [stockLoading, setStockLoading] = useState(false);
  const [stockFailure, setStockFailure] = useState(null);
  // Bumped by any "re-check inventory" control; read by the stock effect so a
  // bump re-asks the provider.
  const [providerStockRefresh] = useState(0);
  // A bump has to come from somewhere: re-picking the SAME country is the
  // inventory refresh a user can reach today.
  const refreshProviderStock = () => {
    if (!selectedCountry) return;
    setProviderStockKeyFetched("");
    setStockLoading(true);
  };
  void providerStockRefresh;

  const allCountries = useMemo(() => buildCountryList(catalogue), [catalogue]);
  const canBuyAtAll = true;

  /**
   * Offers for the chosen service in the chosen country, taken from the REAL
   * catalogue.
   *
   * The provider sells ONE product per service+country, so the offers here are
   * the catalogue's cheapest in-stock variants. The price shown is the SELLING
   * price the backend attached (`entry.price`), never the provider cost: a
   * variant the backend could not price profitably is omitted, not guessed.
   *
   * Telegram is the exception: if a card ever has two priced variants AND the
   * backend says they are the two Telegram products, they are labelled with
   * their real names instead of "Lowest price"/"Next tier".
   */
  const serviceOptions = useMemo(() => {
    const country = catalogue?.countries?.[selectedCountry?.slug];
    if (!country || !selectedAppService?.id) return [];

    const telegramStatus = catalogue?.serviceStatus?.telegram;

    const sellable = Object.values(country.services || {})
      .filter(
        (entry) =>
          entry.serviceId === selectedAppService.id &&
          Number(entry.count) > 0 &&
          !entry.blocked &&
          Number.isFinite(entry.price) &&
          entry.price > 0,
      )
      .sort((a, b) => a.price - b.price || a.cost - b.cost || b.count - a.count)
      .slice(0, 2);

    // Named Telegram products only when the backend says the two variants ARE
    // the two products (fresh vs old). Several Telegram variants are all the
    // same provider product at different costs, and must not claim to be
    // "old / open" just because they are the second option.
    const namedTelegram = Array.isArray(telegramStatus?.variantTiers)
      ? telegramStatus.variantTiers.length > 1
      : false;

    return sellable.map((entry, index) => ({
      id: entry.id,
      label: namedTelegram
        ? entry.tier === "telegram_old"
          ? "Old / open"
          : "Fresh / new"
        : index === 0
          ? "Lowest price"
          : "Next tier",
      sellingPrice: entry.price,
      // The catalogue variant. Sent so the server charges exactly this tier
      // rather than re-picking the cheapest one.
      variantId: entry.variantId,
      count: entry.count,
    }));
  }, [catalogue, selectedCountry, selectedAppService]);

  const catalogueServices = useMemo(() => {
    if (!catalogue?.countries) return [];
    // Count how many countries each service is sold in. The backend only lists
    // services that have a real selling price, so an entry here is buyable
    // somewhere; services it blocked (no margin, no provider mapping) are
    // filtered out below instead of being offered at no price.
    const countryCounts = new Map();
    Object.values(catalogue.countries).forEach((country) => {
      const seen = new Set();
      Object.values(country.services || {}).forEach((entry) => {
        // A variant the backend priced as unprofitable is not availability.
        if (entry.serviceId && !entry.blocked) seen.add(entry.serviceId);
      });
      seen.forEach((id) => {
        countryCounts.set(id, (countryCounts.get(id) || 0) + 1);
      });
    });

    const status = catalogue.serviceStatus || {};

    return [...countryCounts.keys()]
      .filter((id) => status[id]?.sellable !== false)
      .map((id) => {
        const sold = catalogue.sold?.[id] || null;
        const meta = status[id] || {};
        return {
          id,
          ...getAppIdentity(id),
          countryCount: countryCounts.get(id) || 0,
          // The configured starting price, for the card subtitle.
          fromPrice: sold?.price ?? meta.priceFrom ?? null,
          tierLabel: meta.tierLabel || sold?.tierLabel || null,
        };
      })
      .sort((left, right) => {
        const priority = [
          "whatsapp",
          "facebook",
          "telegram",
          "instagram",
          "google",
          "gmail",
        ];
        const leftRank = priority.indexOf(left.id);
        const rightRank = priority.indexOf(right.id);
        const rankDifference =
          (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank) -
          (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank);
        return (
          rankDifference ||
          right.countryCount - left.countryCount ||
          left.label.localeCompare(right.label)
        );
      });
  }, [catalogue]);

  const countries = useMemo(() => {
    if (!catalogue || !selectedAppService) return allCountries;
    return allCountries.filter((country) => {
      const services = catalogue.countries?.[country.slug]?.services || {};
      // Only countries where this service has a priced, sellable variant are
      // listed; a country whose only variants are unprofitable would open a
      // confirm screen with no price.
      return Object.values(services).some(
        (entry) =>
          entry.serviceId === selectedAppService.id &&
          !entry.blocked &&
          Number(entry.price) > 0,
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
    if (!q) return catalogueServices.slice(0, VISIBLE_SERVICE_LIMIT);
    return catalogueServices.filter((service) =>
      service.label.toLowerCase().includes(q),
    );
  }, [catalogueServices, searchQuery]);

  // Only meaningful while browsing (not searching): says how many services are
  // still reachable by typing.
  const hiddenServiceCount = searchQuery.trim()
    ? 0
    : Math.max(0, catalogueServices.length - VISIBLE_SERVICE_LIMIT);

  // The offer that is actually selected: the user's explicit choice while it is
  // still a valid option for this service/country, otherwise the first option.
  //
  // This used to be a useEffect that called setSelectedOffer, which re-rendered
  // the whole page a second time on every step change (the lint error this
  // fixes) and could leave the confirm button acting on a stale offer for one
  // frame. Deriving it during render makes "what is selected" true immediately.
  const effectiveOffer = useMemo(() => {
    if (!selectedAppService || serviceOptions.length === 0) return null;
    if (selectedOffer && serviceOptions.some((o) => o.id === selectedOffer.id)) {
      return selectedOffer;
    }
    return serviceOptions[0];
  }, [selectedAppService, selectedOffer, serviceOptions]);

  useEffect(() => {
    // No country (or no provider id for it): there is nothing to ask, so the
    // stock state belongs to that country's key - it is empty by definition.
    if (!selectedCountry?.providerId) return undefined;

    const controller = new AbortController();
    // The key this answer belongs to. An answer that arrives after the user has
    // moved on is discarded (the abort), never shown as the new inventory.
    const key = `${selectedCountry.providerId}:${selectedAppService?.id ?? ""}`;

    getNumbersStatus(selectedCountry.providerId, { signal: controller.signal })
      .then((stock) => {
        if (controller.signal.aborted) return;
        setProviderStock(stock);
        setStockFailure(null);
        setProviderStockKeyFetched(key);
        setStockLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setProviderStock(null);
        setStockFailure(error);
        setProviderStockKeyFetched(key);
        setStockLoading(false);
      });

    return () => controller.abort();
  }, [selectedCountry, selectedAppService?.id, providerStockRefresh]);

  // Stock is keyed by the COUNTRY + service it was fetched for. Deriving the
  // state from the key (instead of clearing it inside an effect) means a country
  // switch can never show the previous country's count, and "checking..." is
  // true from the first frame rather than one render later.
  const stockKey = `${selectedCountry?.providerId ?? ""}:${selectedAppService?.id ?? ""}`;
  const stockIsForThisSelection =
    providerStockKeyFetched === stockKey && Boolean(selectedCountry?.providerId);
  const currentStock = stockIsForThisSelection ? providerStock : null;
  const currentStockError = stockIsForThisSelection ? stockFailure : null;
  // True from the first frame after a country is picked - never one render of
  // stale "N numbers" from the previous country.
  const isCheckingStock =
    Boolean(selectedCountry?.providerId) &&
    !stockIsForThisSelection &&
    !currentStockError;
  const isLoadingStock = isCheckingStock || stockLoading;

  const purchasePrice = Number(effectiveOffer?.sellingPrice || 0);
  const availableBalance = Number(animatedBalance || 0);
  const shortfall = Math.max(0, purchasePrice - availableBalance);
  const hasKnownPrice = Number.isFinite(purchasePrice) && purchasePrice > 0;
  const hasInsufficientFunds = hasKnownPrice && shortfall > 0;

  // Stock is keyed by the SERVICE (whatsapp -> whatsapp_0, whatsapp_canada_0).
  // The offer ids ("voucher", "all-countries", "fresh", "used") are display
  // tiers that do not exist in the provider payload, so they must not be used
  // as the lookup key or every offer would read as out of stock.
  const providerStockKey = selectedAppService?.id || null;
  const providerCount = providerStockKey
    ? getProviderStockCount(currentStock, providerStockKey)
    : null;
  const stockCount = providerCount ?? 0;
  const isOutOfStock =
    providerCount === 0 ||
    (currentStock &&
      Object.keys(currentStock).length > 0 &&
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
    setProviderStockKeyFetched("");
    setStep(2);
  };

  const handleSelectCountry = (country) => {
    setSelectedCountry(country);
    setSelectedOffer(null);
    setPurchaseError(null);
    setProviderStockKeyFetched("");
    setSearchQuery("");
    setStep(3);
  };

  const handleOfferSelect = (offer) => {
    setSelectedOffer(offer);
    setPurchaseError(null);
  };

  const mapProviderError = (error) => {
    if (!error) return "Failed to purchase number. Please try again.";
    // The server's own explanation wins: for a refused service it names the
    // reason (e.g. "Baidu is not sold...") or the real provider cost.
    if (error.code === "PRICE_CHANGED") {
      return error.message || "The price changed. Please review and confirm again.";
    }
    return error.message || "Failed to purchase number. Please try again.";
  };

  const handleConfirmPurchase = async () => {
    if (isSubmitting) return;
    if (hasInsufficientFunds || isLoadingStock || currentStockError)
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
        // The server prices from the catalogue, which is keyed by the country
        // slug ("usa"), not by the ISO-2 code sent to the provider ("US").
        countrySlug: selectedCountry.slug,
        // The catalogue variant the user chose ("Lowest price" / "Next tier"),
        // so the server charges exactly that tier instead of re-picking.
        variantId: selectedOffer.variantId,
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
        number: number.number,
        countryCode: number.countryCode || countryCode,
        countryName: number.countryName || selectedCountry.name,
        service: number.service,
        price: number.priceValue ?? purchasePrice,
        orderId: number.orderId,
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
      setPurchaseError({
        message: mapProviderError(error),
        // A refusal by the provider's ACCOUNT (no credit, bad key, banned) will
        // fail identically on every retry. Stock, network and timeout failures
        // may not, so those keep the Retry button.
        retryable: !NON_RETRYABLE_CODES.has(error?.code),
      });
    }
  };

  if (isLoadingCatalogue) {
    // The first load can take a moment while the 10 MB catalogue is fetched and
    // parsed. Do not hold the whole page behind it: step 1 only needs the
    // service list, which comes from the catalogue, so show the heading and a
    // skeleton grid instead of a blank screen with a spinner. Searching still
    // works as soon as the data lands.
    return (
      <section className="buy-flow-container">
        <header className="buy-header">
          <div className="buy-header-left">
            <div className="buy-title-group">
              <h1 className="buy-main-title">Buy a number</h1>
              <span className="buy-step-indicator">
                Step 1 of 3 · Service
              </span>
            </div>
          </div>
        </header>

        <div className="buy-step-content">
          <h2 className="step-subtitle">Choose a service</h2>

          <div className="country-search-bar" aria-hidden="true">
            <FiSearch className="search-icon" />
            <input
              type="search"
              placeholder="Loading services..."
              disabled
              readOnly
            />
          </div>

          {isWarmingUp && (
            <div className="purchase-error-card" role="status" aria-live="polite">
              <div className="insufficient-header">
                <FiLoader className="spinner-icon" />
                <h3>Preparing the price catalogue</h3>
              </div>
              <p className="insufficient-text">
                This only happens the first time. Prices are being loaded from
                the provider.
              </p>
            </div>
          )}

          <div className="services-grid" aria-busy="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="service-card service-card-skeleton" key={index}>
                <span className="skeleton-block skeleton-icon" />
                <span className="service-details">
                  <span className="skeleton-block skeleton-line" />
                  <span className="skeleton-block skeleton-line short" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
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
                    {Number(service.fromPrice) > 0 && (
                      <span className="service-price">
                        from ₦{Number(service.fromPrice).toLocaleString()}
                      </span>
                    )}
                    <span className="service-countries-count">
                      {service.countryCount} countries
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

          {hiddenServiceCount > 0 && (
            <p className="service-more-hint">
              Showing the {VISIBLE_SERVICE_LIMIT} most widely available services.
              Search to find {hiddenServiceCount.toLocaleString()} more.
            </p>
          )}
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
                    className={`offer-toggle${effectiveOffer?.id === option.id ? " active" : ""}`}
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
                {serviceOptions.length === 0
                  ? isLoadingStock
                    ? "Checking availability..."
                    : "Not available"
                  : isLoadingStock
                    ? "Checking provider inventory..."
                    : currentStockError
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
                {hasKnownPrice
                  ? `₦${purchasePrice.toLocaleString()}`
                  : "Not available"}
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

          {serviceOptions.length === 0 && (
            <div className="purchase-error-card" role="alert">
              <p className="insufficient-text">
                {selectedAppService?.label} is not available in{" "}
                {selectedCountry.name} right now: there is no current price for
                this service, so nothing can be charged. Other services are
                still available.
              </p>
            </div>
          )}

          {currentStockError && (
            <div className="purchase-error-card" role="alert">
              <p className="insufficient-text">
                Could not check provider inventory: {currentStockError.message}
              </p>
              <button
                type="button"
                className="insufficient-fund-btn"
                onClick={refreshProviderStock}
              >
                <FiRefreshCw aria-hidden="true" />
                Check inventory again
              </button>
            </div>
          )}

          {providerCount === 0 &&
            !currentStockError &&
            !isLoadingStock && (
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
              {/* Only useful when retrying could actually help. A provider-credit
                  or account-configuration refusal is not fixed by clicking again,
                  so a Retry button there just burns the user's patience. */}
              {!purchaseError.retryable && (
                <p className="insufficient-text">
                  Nothing was charged. Contact support if this continues.
                </p>
              )}
              {purchaseError.retryable !== false && (
                <button
                  type="button"
                  className="insufficient-fund-btn"
                  onClick={handleConfirmPurchase}
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* The confirm button stays visible even when the wallet is short:
              the insufficient-funds card above explains the gap and offers
              "Fund wallet", and a button that vanishes reads as a broken page.
              It is simply disabled until there is enough balance. */}
          {hasKnownPrice && selectedOffer && (
            <button
              type="button"
              className="confirm-submit-btn"
              disabled={
                hasInsufficientFunds ||
                isSubmitting ||
                isLoadingStock ||
                Boolean(currentStockError) ||
                isOutOfStock ||
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
                    {hasInsufficientFunds
                      ? `Confirm purchase · ₦${purchasePrice.toLocaleString()} (add funds)`
                      : `Confirm purchase · ₦${purchasePrice.toLocaleString()}`}
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
