import "../CSS/dashboard/components/StatCard.css";

function StatCard({ icon: Icon, value, label, tone = "blue" }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon aria-hidden="true" />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

export default StatCard;
