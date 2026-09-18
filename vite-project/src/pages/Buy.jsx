import { useMemo, useState } from "react";
import { FiChevronLeft, FiSearch, FiCheck, FiLoader } from "react-icons/fi";
import {
  SiWhatsapp,
  SiTelegram,
  SiInstagram,
  SiFacebook,
  SiTiktok,
  SiX,
  SiApple,
  SiGoogle,
  SiNetflix,
  SiSnapchat,
  SiTinder,
  SiDiscord,
  SiYoutube,
  SiSpotify,
  SiUber,
} from "react-icons/si";
import {
  FaAmazon,
  FaLinkedin,
  FaMicrosoft,
  FaRobot,
  FaShieldHalved,
} from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import "../CSS/dashboard/pages/Buy.css";

// 1. Service List with Official Attached Logos
const SERVICES = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    price: "₦2,000.00",
    rawPrice: 2000,
    countries: 28,
    icon: <SiWhatsapp color="#25D366" />,
  },
  {
    id: "telegram",
    name: "Telegram",
    price: "₦2,200.00",
    rawPrice: 2200,
    countries: 56,
    icon: <SiTelegram color="#24A1DE" />,
  },
  {
    id: "instagram",
    name: "Instagram",
    price: "₦2,500.00",
    rawPrice: 2500,
    countries: 28,
    icon: <SiInstagram color="#E4405F" />,
  },
  {
    id: "facebook",
    name: "Facebook",
    price: "₦2,400.00",
    rawPrice: 2400,
    countries: 28,
    icon: <SiFacebook color="#1877F2" />,
  },
  {
    id: "tiktok",
    name: "TikTok",
    price: "₦2,300.00",
    rawPrice: 2300,
    countries: 28,
    icon: <SiTiktok color="#000000" />,
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    price: "₦2,600.00",
    rawPrice: 2600,
    countries: 28,
    icon: <SiX color="#000000" />,
  },
  {
    id: "openai",
    name: "OpenAI / ChatGPT",
    price: "₦3,500.00",
    rawPrice: 3500,
    countries: 42,
    icon: <FaRobot color="#10A37F" />,
  },
  {
    id: "apple",
    name: "Apple",
    price: "₦3,000.00",
    rawPrice: 3000,
    countries: 28,
    icon: <SiApple color="#000000" />,
  },
  {
    id: "google",
    name: "Google",
    price: "₦3,000.00",
    rawPrice: 3000,
    countries: 28,
    icon: <SiGoogle color="#4285F4" />,
  },
  {
    id: "netflix",
    name: "Netflix",
    price: "₦2,400.00",
    rawPrice: 2400,
    countries: 28,
    icon: <SiNetflix color="#E50914" />,
  },
  {
    id: "snapchat",
    name: "Snapchat",
    price: "₦2,200.00",
    rawPrice: 2200,
    countries: 28,
    icon: <SiSnapchat color="#FFFC00" />,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    price: "₦2,200.00",
    rawPrice: 2200,
    countries: 28,
    icon: <FaLinkedin color="#0A66C2" />,
  },
  {
    id: "tinder",
    name: "Tinder",
    price: "₦2,800.00",
    rawPrice: 2800,
    countries: 31,
    icon: <SiTinder color="#FE3C72" />,
  },
  {
    id: "amazon",
    name: "Amazon",
    price: "₦2,900.00",
    rawPrice: 2900,
    countries: 25,
    icon: <FaAmazon color="#FF9900" />,
  },
  {
    id: "microsoft",
    name: "Microsoft",
    price: "₦2,700.00",
    rawPrice: 2700,
    countries: 35,
    icon: <FaMicrosoft color="#00A4EF" />,
  },
  {
    id: "discord",
    name: "Discord",
    price: "₦2,100.00",
    rawPrice: 2100,
    countries: 40,
    icon: <SiDiscord color="#5865F2" />,
  },
  {
    id: "youtube",
    name: "YouTube",
    price: "₦2,500.00",
    rawPrice: 2500,
    countries: 30,
    icon: <SiYoutube color="#FF0000" />,
  },
  {
    id: "spotify",
    name: "Spotify",
    price: "₦2,000.00",
    rawPrice: 2000,
    countries: 22,
    icon: <SiSpotify color="#1DB954" />,
  },
  {
    id: "uber",
    name: "Uber",
    price: "₦2,300.00",
    rawPrice: 2300,
    countries: 18,
    icon: <SiUber color="#000000" />,
  },
];

// 2. Country List Data with SVG Flag URLs
const COUNTRIES = [
  {
    code: "NG",
    name: "Nigeria",
    dial: "+234",
    price: "₦2,000.00",
    flagUrl: "https://flagcdn.com/w40/ng.png",
  },
  {
    code: "GH",
    name: "Ghana",
    dial: "+233",
    price: "₦3,200.00",
    flagUrl: "https://flagcdn.com/w40/gh.png",
  },
  {
    code: "KE",
    name: "Kenya",
    dial: "+254",
    price: "₦3,200.00",
    flagUrl: "https://flagcdn.com/w40/ke.png",
  },
  {
    code: "US",
    name: "United States",
    dial: "+1",
    price: "₦3,200.00",
    flagUrl: "https://flagcdn.com/w40/us.png",
  },
  {
    code: "GB",
    name: "United Kingdom",
    dial: "+44",
    price: "₦3,200.00",
    flagUrl: "https://flagcdn.com/w40/gb.png",
  },
  {
    code: "ZA",
    name: "South Africa",
    dial: "+27",
    price: "₦3,200.00",
    flagUrl: "https://flagcdn.com/w40/za.png",
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    dial: "+971",
    price: "₦3,320.00",
    flagUrl: "https://flagcdn.com/w40/ae.png",
  },
  {
    code: "DE",
    name: "Germany",
    dial: "+49",
    price: "₦2,560.00",
    flagUrl: "https://flagcdn.com/w40/de.png",
  },
  {
    code: "EG",
    name: "Egypt",
    dial: "+20",
    price: "₦2,960.00",
    flagUrl: "https://flagcdn.com/w40/eg.png",
  },
  {
    code: "IN",
    name: "India",
    dial: "+91",
    price: "₦2,680.00",
    flagUrl: "https://flagcdn.com/w40/in.png",
  },
  {
    code: "IT",
    name: "Italy",
    dial: "+39",
    price: "₦2,800.00",
    flagUrl: "https://flagcdn.com/w40/it.png",
  },
  {
    code: "CA",
    name: "Canada",
    dial: "+1",
    price: "₦2,520.00",
    flagUrl: "https://flagcdn.com/w40/ca.png",
  },
  {
    code: "RW",
    name: "Rwanda",
    dial: "+250",
    price: "₦3,080.00",
    flagUrl: "https://flagcdn.com/w40/rw.png",
  },
  {
    code: "UG",
    name: "Uganda",
    dial: "+256",
    price: "₦3,040.00",
    flagUrl: "https://flagcdn.com/w40/ug.png",
  },
  {
    code: "ES",
    name: "Spain",
    dial: "+34",
    price: "₦2,760.00",
    flagUrl: "https://flagcdn.com/w40/es.png",
  },
  {
    code: "NL",
    name: "Netherlands",
    dial: "+31",
    price: "₦2,840.00",
    flagUrl: "https://flagcdn.com/w40/nl.png",
  },
  {
    code: "TZ",
    name: "Tanzania",
    dial: "+255",
    price: "₦3,000.00",
    flagUrl: "https://flagcdn.com/w40/tz.png",
  },
  {
    code: "TR",
    name: "Turkey",
    dial: "+90",
    price: "₦3,280.00",
    flagUrl: "https://flagcdn.com/w40/tr.png",
  },
  {
    code: "PT",
    name: "Portugal",
    dial: "+351",
    price: "₦3,200.00",
    flagUrl: "https://flagcdn.com/w40/pt.png",
  },
  {
    code: "SE",
    name: "Sweden",
    dial: "+46",
    price: "₦3,240.00",
    flagUrl: "https://flagcdn.com/w40/se.png",
  },
  {
    code: "PH",
    name: "Philippines",
    dial: "+63",
    price: "₦2,880.00",
    flagUrl: "https://flagcdn.com/w40/ph.png",
  },
  {
    code: "FR",
    name: "France",
    dial: "+33",
    price: "₦2,600.00",
    flagUrl: "https://flagcdn.com/w40/fr.png",
  },
  {
    code: "BR",
    name: "Brazil",
    dial: "+55",
    price: "₦2,720.00",
    flagUrl: "https://flagcdn.com/w40/br.png",
  },
  {
    code: "MX",
    name: "Mexico",
    dial: "+52",
    price: "₦3,360.00",
    flagUrl: "https://flagcdn.com/w40/mx.png",
  },
];

function Buy() {
  const navigate = useNavigate();

  // Navigation step control (1: Service, 2: Country, 3: Confirm)
  const [step, setStep] = useState(1);

  // Selected state
  const [selectedService, setSelectedService] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  // Search filter query
  const [searchQuery, setSearchQuery] = useState("");

  // Loading state on purchase confirmation
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter countries list dynamically
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return COUNTRIES;
    const q = searchQuery.toLowerCase().trim();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Handle Step Back Button
  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    } else {
      navigate("/dashboard");
    }
  };

  // Step 1: Click Service
  const handleSelectService = (service) => {
    setSelectedService(service);
    setStep(2);
  };

  // Step 2: Click Country
  const handleSelectCountry = (country) => {
    setSelectedCountry(country);
    setStep(3);
  };

  // Step 3: Purchase confirmation action
  const handleConfirmPurchase = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      navigate("/my-numbers");
    }, 1500);
  };

  return (
    <section className="buy-flow-container">
      {/* HEADER WITH PROGRESS BAR */}
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
              {step === 1 ? "Service" : step === 2 ? "Country" : "Confirm"}
            </span>
          </div>
        </div>

        {/* 3 Step Progress Bar */}
        <div className="buy-progress-bar">
          <div className={`progress-segment ${step >= 1 ? "active" : ""}`} />
          <div className={`progress-segment ${step >= 2 ? "active" : ""}`} />
          <div className={`progress-segment ${step >= 3 ? "active" : ""}`} />
        </div>
      </header>

      {/* STEP 1: CHOOSE SERVICE */}
      {step === 1 && (
        <div className="buy-step-content slide-up-anim">
          <h2 className="step-subtitle">Choose a service</h2>
          <div className="services-grid">
            {SERVICES.map((srv, idx) => (
              <div
                key={srv.id}
                className="service-card"
                style={{ animationDelay: `${idx * 0.02}s` }}
                onClick={() => handleSelectService(srv)}
              >
                <div className="service-icon-wrapper">{srv.icon}</div>
                <div className="service-details">
                  <h3 className="service-name">{srv.name}</h3>
                  <span className="service-price">From {srv.price}</span>
                  <span className="service-countries-count">
                    {srv.countries} countries
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: CHOOSE COUNTRY */}
      {step === 2 && (
        <div className="buy-step-content slide-up-anim">
          <h2 className="step-subtitle">
            Choose a country for {selectedService?.name}
          </h2>

          {/* Search Bar */}
          <div className="country-search-bar">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search country or dialling code"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Country List */}
          <div className="countries-list">
            {filteredCountries.map((ctry, idx) => (
              <div
                key={ctry.code}
                className="country-card"
                style={{ animationDelay: `${idx * 0.02}s` }}
                onClick={() => handleSelectCountry(ctry)}
              >
                <div className="country-info">
                  {/* Flag Image Badge */}
                  <img
                    src={ctry.flagUrl}
                    alt={ctry.name}
                    className="country-flag-img"
                  />

                  <div className="country-text">
                    <span className="country-name">{ctry.name}</span>
                    <span className="country-subtext">
                      {ctry.dial} · instant delivery
                    </span>
                  </div>
                </div>
                <div className="country-price">{ctry.price}</div>
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

      {/* STEP 3: CONFIRM ORDER */}
      {step === 3 && selectedService && selectedCountry && (
        <div className="buy-step-content slide-up-anim">
          <div className="confirm-card">
            <h2 className="confirm-title">Order summary</h2>

            <div className="confirm-row">
              <span className="confirm-label">Service</span>
              <span className="confirm-value font-bold flex-align-center">
                <span className="confirm-app-logo">{selectedService.icon}</span>
                {selectedService.name}
              </span>
            </div>

            <div className="confirm-row">
              <span className="confirm-label">Country</span>
              <span className="confirm-value font-bold flex-align-center">
                <img
                  src={selectedCountry.flagUrl}
                  alt={selectedCountry.name}
                  className="country-flag-img-sm"
                />
                {selectedCountry.name} ({selectedCountry.dial})
              </span>
            </div>

            <div className="confirm-row">
              <span className="confirm-label">Delivery</span>
              <span className="confirm-value">Instant · demo number</span>
            </div>

            <hr className="confirm-divider" />

            <div className="confirm-row">
              <span className="confirm-label">Total</span>
              <span className="confirm-price">{selectedCountry.price}</span>
            </div>

            <div className="confirm-row">
              <span className="confirm-label">Wallet balance</span>
              <span className="confirm-balance">₦10,750.00</span>
            </div>
          </div>

          {/* CONFIRM BUTTON */}
          <button
            type="button"
            className="confirm-submit-btn"
            disabled={isSubmitting}
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
                <span>Confirm purchase · {selectedCountry.price}</span>
              </>
            )}
          </button>

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
