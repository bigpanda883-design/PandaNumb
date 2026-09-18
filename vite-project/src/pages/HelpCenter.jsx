import { FiArrowRight, FiHelpCircle } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../CSS/dashboard/pages/HelpCenter.css";

function HelpCenter() {
  return (
    <section className="dashboard-section-page help-center-page">
      <span className="section-overline">HELP CENTER</span>
      <h1>How can we help?</h1>
      <p>Find answers and get support when you need it.</p>
      <div className="section-empty-panel">
        <FiHelpCircle />
        <strong>Help resources are being prepared</strong>
        <span>Guides and support options can be added here.</span>
        <Link to="/dashboard">
          Back to dashboard <FiArrowRight />
        </Link>
      </div>
    </section>
  );
}

export default HelpCenter;
