import { FiCheckCircle, FiLink, FiMousePointer, FiGrid } from "react-icons/fi";
import "../CSS/About.css";

const HowItWorks = () => {
  const steps = [
    {
      number: "01",
      icon: <FiCheckCircle />,

      title: "Create your account",
      description:
        "Sign up with your name, email and phone number in under a minute.",
      active: false,
    },
    {
      number: "02",
      icon: <FiLink />,
      title: "Fund your wallet",
      description:
        "Deposit from as little as ₦100 through our secure payment page.",
      active: false,
    },
    {
      number: "03",
      icon: <FiMousePointer />,
      title: "Choose your service and number",
      description:
        "Pick the platform, the country and an available number at a clear price.",
      active: false,
    },
    {
      number: "04",
      icon: <FiGrid />,
      title: "Receive and manage your number",
      description:
        "Your verification code lands on the number screen. Everything stays in your dashboard.",
      active: true,
    },
  ];

  return (
    <section id="how-it-works" className="how-it-works-section">
      <div className="how-it-works-container">
        <div className="how-it-works-header">
          <span className="section-pill-badge">HOW IT WORKS</span>
          <h2 className="section-title">Four steps from sign up to verified</h2>
          <p className="section-subtitle">
            No hidden charges, no guesswork. You always see the price before you
            confirm.
          </p>
        </div>

        <div className="steps-row">
          {steps.map((step) => (
            <div
              key={step.number}
              className={`step-card ${step.active ? "active-card" : ""}`}
            >
              <div className="step-card-top">
                <div
                  className={`step-icon-wrapper ${step.active ? "active-icon" : ""}`}
                >
                  {step.icon}
                </div>
                <span className="step-number">{step.number}</span>
              </div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-description">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
