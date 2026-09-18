import { useState } from "react";
import { Link } from "react-router-dom";
import "../CSS/FaqCtaSection.css";

const FaqCtaSection = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const faqData = [
    {
      question: "How long does it take to get a verification code?",
      answer:
        "Most verification codes arrive within 10 to 30 seconds after triggering the SMS from the service provider.",
    },
    {
      question: "What happens if I don't receive an OTP code?",
      answer:
        "If no SMS code is received within the allocated time, your order cancels automatically, and funds remain safely in your wallet.",
    },
    {
      question: "How do I add money to my balance?",
      answer:
        "You can easily fund your wallet via online card payments, bank transfer, or supported instant payment channels.",
    },
    {
      question: "Can I use the same phone number twice?",
      answer:
        "Our temporary numbers are single-use per activation to guarantee privacy and security for every user.",
    },
  ];

  const toggleAccordion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="faq-cta-wrapper">
      {/* FAQ SECTION */}
      <div className="faq-container">
        <div className="faq-header">
          <span className="faq-pill">FAQ</span>
          <h2 className="faq-title">Questions, answered</h2>
        </div>

        <div className="faq-accordion">
          {faqData.map((item, index) => (
            <div
              key={index}
              className={`faq-item ${openIndex === index ? "open" : ""}`}
              onClick={() => toggleAccordion(index)}
            >
              <div className="faq-question-row">
                <h3 className="faq-question">{item.question}</h3>
                <span className="faq-icon">
                  {openIndex === index ? "−" : "+"}
                </span>
              </div>
              {openIndex === index && (
                <div className="faq-answer-row">
                  <p className="faq-answer">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CALL TO ACTION BANNER */}
      <div className="cta-container">
        <div className="cta-banner">
          <div className="cta-bg-circle circle-left"></div>
          <div className="cta-bg-circle circle-right"></div>

          <div className="cta-content">
            <h2 className="cta-title">Ready to get your number?</h2>
            <p className="cta-subtitle">
              Create your account, fund your wallet from ₦100 and buy your first
              number today.
            </p>
            <div className="cta-actions">
              <Link className="cta-btn-primary" to="/signup">
                Get Started
              </Link>
              <Link className="cta-btn-secondary" to="/signup">
                Buy a Number
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FaqCtaSection;
