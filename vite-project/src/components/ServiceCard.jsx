import { FiArrowUpRight } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../CSS/dashboard/components/ServiceCard.css";

function ServiceCard({ icon: Icon, name, tone }) {
  return (
    <Link className="service-card" to="/buy">
      <span className={`service-icon ${tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <span className="service-card-copy">
        <strong>{name}</strong>
        <small>Get a number</small>
      </span>
      <FiArrowUpRight className="service-arrow" aria-hidden="true" />
    </Link>
  );
}

export default ServiceCard;
