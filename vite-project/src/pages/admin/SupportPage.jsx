/**
 * Support Tickets - /admin/support
 *
 * There is no support/ticket endpoint in the API yet, so this screen does NOT
 * call one and does NOT show demo tickets. It shows the live support contact
 * channels plus an honest empty queue, and links to the modules that exist.
 * When an endpoint is added, load it here with useAsyncResource.
 *
 * Styling: admin/admin.css (shared) + admin/AdminSupport.css (page scoped).
 */
import {
  FiClock,
  FiHelpCircle,
  FiInbox,
  FiLifeBuoy,
  FiUsers,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { EmptyState, StatCard } from "./adminUi";
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminSupport.css";

const HELP_AREAS = [
  {
    title: "Wallet & payments",
    body: "Deposits, credits and payment-provider issues are reviewed in Wallet & Payments.",
    to: "/admin/payments",
    linkLabel: "Open payments",
  },
  {
    title: "Purchases & numbers",
    body: "Customer number purchases, delivery failures and refunds live in Purchases.",
    to: "/admin/purchases",
    linkLabel: "Open purchases",
  },
  {
    title: "Customers",
    body: "Account access, wallet balance and presence questions start with the Users page.",
    to: "/admin/users",
    linkLabel: "Open users",
  },
];

function SupportPage() {
  return (
    <div className="admin-page-body admin-support-page">
      <div className="admin-stat-grid">
        <StatCard
          icon={FiInbox}
          label="Open tickets"
          value="—"
          hint="Awaiting support queue"
        />
        <StatCard
          icon={FiClock}
          label="Awaiting reply"
          value="—"
          tone="amber"
        />
        <StatCard icon={FiUsers} label="Agents online" value="—" tone="green" />
        <StatCard
          icon={FiLifeBuoy}
          label="Help desk"
          value="Live"
          hint="Customer Help Center is live"
          tone="purple"
        />
      </div>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Ticket queue</h2>
            <p>
              The support inbox endpoint is not part of the API yet, so the
              queue stays empty instead of showing placeholder tickets.
            </p>
          </div>
        </header>
        <EmptyState
          icon={FiHelpCircle}
          title="No support tickets to show"
          description="Customer messages reach the Help Center today. Once the support API is available, tickets will be listed here."
        />
      </section>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>Where to resolve common requests</h2>
            <p>Jump straight to the admin page that owns each issue.</p>
          </div>
        </header>
        <div className="admin-support-help">
          {HELP_AREAS.map((area) => (
            <div key={area.title}>
              <strong>{area.title}</strong>
              <p>{area.body}</p>
              <Link className="admin-link-button" to={area.to}>
                {area.linkLabel}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default SupportPage;
