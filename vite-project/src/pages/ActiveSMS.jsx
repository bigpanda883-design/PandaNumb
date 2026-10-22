import { FiArrowRight, FiMessageSquare } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../CSS/dashboard/pages/ActiveSMS.css";

function ActiveSMS() {
  return (
    <section className="dashboard-section-page active-sms-page">
      <span className="section-overline">ACTIVE LOGS</span>
      <h1>Active Logs</h1>
      <p>Monitor verification messages for your active numbers.</p>
      <div className="section-empty-panel">
        <FiMessageSquare />
        <strong>No active SMS sessions</strong>
        <span>
          Verification messages will appear here while a number is active.
        </span>
        <Link to="/buy">
          Buy a number <FiArrowRight />
        </Link>
      </div>
    </section>
  );
}

export default ActiveSMS;
