import { FiLock, FiMousePointer, FiGrid, FiHeadphones } from "react-icons/fi";
import "../CSS/Services.css";

const Services = () => {
  const features = [
    {
      id: 1,
      icon: <FiLock />,
      title: "Secure Payments",
      description:
        "Fund your wallet through the supported payment system. Your balance updates only after the payment is confirmed.",
    },
    {
      id: 2,
      icon: <FiMousePointer />,
      title: "Simple Buying",
      description:
        "Choose your service, country and number in a few steps, with the price and your remaining balance shown upfront.",
    },
    {
      id: 3,
      icon: <FiGrid />,
      title: "Easy Management",
      description:
        "Every purchased number, order ID and verification code lives in one dashboard you can open from any device.",
    },
    {
      id: 4,
      icon: <FiHeadphones />,
      title: "Dedicated Support",
      description:
        "Get help through WhatsApp or email whenever a number or payment needs a human.",
    },
  ];

  return (
    <section id="why-us" className="why-us-section">
      <div className="why-us-container">
        <div className="why-us-header">
          <span className="why-us-pill">WHY PANDA NUMBERS</span>
          <h2 className="why-us-title">Built to be trusted with your money</h2>
          <p className="why-us-subtitle">
            Balances, prices and payment status are all verified on our servers
            — never in your browser.
          </p>
        </div>

        <div className="features-flex-grid">
          {features.map((item) => (
            <div key={item.id} className="feature-card">
              <div className="feature-icon-wrapper">{item.icon}</div>
              <div className="feature-content">
                <h3 className="feature-title">{item.title}</h3>
                <p className="feature-description">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
