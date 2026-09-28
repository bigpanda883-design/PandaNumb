import { useState } from "react";
import {
  FiChevronDown,
  FiChevronUp,
  FiMail,
  FiMessageSquare,
  FiSearch,
} from "react-icons/fi";
import { usePageLoading } from "../hooks/usePageLoading";
import { HelpCenterSkeleton } from "../components/skeleton/PageSkeletons";
import "../CSS/dashboard/pages/HelpCenter.css";

const faqData = [
  {
    id: "account",
    question: "How do I create an account?",
    answer:
      "Tap Get Started, enter your full name, email, phone number and a password, then confirm your email to sign in.",
  },
  {
    id: "deposit",
    question: "How do I deposit money?",
    answer:
      "Open your wallet, tap Deposit, choose a preset amount or enter your own, then continue to the secure payment page.",
  },
  {
    id: "min-deposit",
    question: "What is the minimum deposit?",
    answer: "You can fund your wallet from as little as ₦100.",
  },
  {
    id: "number-cost",
    question: "How much does a number cost?",
    answer:
      "Prices start from around ₦2,000 and depend on the service, the country and current availability. The exact price is always shown before you confirm.",
  },
  {
    id: "low-balance",
    question: "What happens if I do not have enough balance?",
    answer:
      "The purchase is stopped before anything is charged. You will see exactly how much is required and how much you have, with a shortcut to deposit.",
  },
  {
    id: "no-otp",
    question: "What happens if I do not receive an OTP?",
    answer:
      "Open the number in My Numbers and tap Refresh. If no code arrives within the waiting window, contact support and we will resolve it.",
  },
  {
    id: "contact-support",
    question: "How do I contact support?",
    answer:
      "Use the Help Center to chat with us on WhatsApp or send an email. We reply quickly during working hours.",
  },
  {
    id: "history",
    question: "Can I see my previous purchases?",
    answer:
      "Yes. Every purchase and wallet movement is listed under Transactions, and every number you bought stays in My Numbers.",
  },
];

function HelpCenter() {
  const [searchTerm, setSearchTerm] = useState("");
  const [openFaqId, setOpenFaqId] = useState("account"); // 'account' open by default matching screenshot
  const { isLoading } = usePageLoading();

  const toggleFaq = (id) => {
    setOpenFaqId((prev) => (prev === id ? null : id));
  };

  const filteredFaqs = faqData.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (isLoading) return <HelpCenterSkeleton />;

  return (
    <div className="help-center-wrapper">
      {/* Header Section */}
      <div className="help-center-header">
        <h1>Help Center</h1>
        <p>
          Chat with Panda Numbers support on WhatsApp, send us an email, or
          search the answers to common wallet, purchase and OTP questions.
        </p>
      </div>

      {/* Support Action Cards */}
      <div className="help-cards-container">
        {/* WhatsApp Support Card */}
        <div className="help-card">
          <div className="help-card-icon-wrap">
            <FiMessageSquare className="help-card-icon" />
          </div>
          <h3>WhatsApp Support</h3>
          <p className="help-card-contact">09048247067</p>
          <a
            href="https://wa.me/2349048247067"
            target="_blank"
            rel="noopener noreferrer"
            className="help-btn primary-btn"
          >
            Chat on WhatsApp
          </a>
        </div>

        {/* Email Support Card */}
        <div className="help-card">
          <div className="help-card-icon-wrap">
            <FiMail className="help-card-icon" />
          </div>
          <h3>Email Support</h3>
          <p className="help-card-contact">Bigpanda883@gmail.com</p>
          <a
            href="mailto:Bigpanda883@gmail.com"
            className="help-btn secondary-btn"
          >
            Email Support
          </a>
        </div>
      </div>

      {/* FAQs & Search Panel */}
      <div className="help-faq-card">
        {/* Search Input */}
        <div className="faq-search-wrap">
          <FiSearch className="faq-search-icon" />
          <input
            type="text"
            placeholder="Search help articles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* FAQ List */}
        <div className="faq-list">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`faq-item ${isOpen ? "open" : ""}`}
                >
                  <button
                    type="button"
                    className="faq-question-btn"
                    onClick={() => toggleFaq(faq.id)}
                  >
                    <span>{faq.question}</span>
                    {isOpen ? (
                      <FiChevronUp className="faq-arrow" />
                    ) : (
                      <FiChevronDown className="faq-arrow" />
                    )}
                  </button>
                  {isOpen && <div className="faq-answer">{faq.answer}</div>}
                </div>
              );
            })
          ) : (
            <div className="faq-no-results">
              No articles match your search criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HelpCenter;
