import { useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiBell,
  FiChevronDown,
  FiCreditCard,
  FiGrid,
  FiHelpCircle,
  FiLogOut,
  FiMenu,
  FiMoon,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShield,
  FiTag,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { clearAuthUser, getAuthUser } from "../auth/authStorage";
import {
  fetchAdminDeposits,
  fetchAdminPaymentSummary,
  fetchAdminUser,
  fetchAdminUsers,
  fetchAdminPurchases,
  fetchAdminTransactions,
  logoutUser,
} from "../services/apiClient";
import { fetchCatalogue } from "../services/accPrices";
import "../CSS/dashboard/pages/AdminPayments.css";

const navigation = [
  { label: "Dashboard", path: "/admin/dashboard", Icon: FiGrid },
  { label: "Users", path: "/admin/users", Icon: FiUsers },
  { label: "Purchases", path: "/admin/purchases", Icon: FiCreditCard },
  { label: "Transactions", path: "/admin/transactions", Icon: FiActivity },
  { label: "Numbers Inventory", path: "/admin/inventory", Icon: FiTag },
  { label: "Wallet & Payments", path: "/admin/payments", Icon: FiCreditCard },
  { label: "Admin & Staff", path: "/admin/staff", Icon: FiShield },
  { label: "Announcements", path: "/admin/announcements", Icon: FiBell },
  { label: "Support Tickets", path: "/admin/support", Icon: FiHelpCircle },
  { label: "Activity Logs", path: "/admin/activity-logs", Icon: FiActivity },
  { label: "Settings", path: "/admin/settings", Icon: FiSettings },
];

const labels = {
  "/admin/users": "Users Management",
  "/admin/purchases": "Purchases",
  "/admin/transactions": "Transactions",
  "/admin/inventory": "Numbers Inventory",
  "/admin/payments": "Wallet & Payments",
  "/admin/staff": "Admin & Staff",
  "/admin/announcements": "Announcements",
  "/admin/support": "Support Tickets",
  "/admin/activity-logs": "Activity Logs",
  "/admin/settings": "Settings & Security",
  "/admin/profile": "Admin Profile",
  "/admin/notifications": "Notifications",
  "/admin/reports": "Reports & Analytics",
  "/admin/referrals": "Referral Management",
};

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function AdminManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const pageTitle =
    labels[location.pathname] ||
    (params.id ? "Record Details" : "Admin Console");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const options = { limit: 50, offset: 0, search };
      if (location.pathname.startsWith("/admin/users")) {
        if (params.id) {
          setPayload({ user: await fetchAdminUser(params.id) });
        } else {
          setPayload(await fetchAdminUsers(options));
        }
      } else if (location.pathname.startsWith("/admin/purchases")) {
        setPayload(await fetchAdminPurchases(options));
      } else if (location.pathname.startsWith("/admin/transactions")) {
        setPayload(await fetchAdminTransactions(options));
      } else if (location.pathname === "/admin/payments") {
        const [deposits, summary] = await Promise.all([
          fetchAdminDeposits(options),
          fetchAdminPaymentSummary(),
        ]);
        setPayload({ deposits, summary });
      } else if (location.pathname.startsWith("/admin/inventory")) {
        const catalogue = await fetchCatalogue();
        const cards = [];
        for (const country of Object.values(catalogue.countries || {})) {
          for (const service of Object.values(country.services || {})) {
            cards.push({
              id: `${country.id}:${service.id}`,
              countryName: country.label || country.id,
              name: service.serviceId,
              variant: service.variantId,
              price: service.price,
              count: service.count,
              blocked: service.blocked,
            });
          }
        }
        setPayload({ items: cards, total: cards.length });
      } else if (location.pathname.startsWith("/admin/staff")) {
        setPayload(await fetchAdminUsers(options));
      } else if (location.pathname === "/admin/profile") {
        const email = getAuthUser()?.email;
        const users = await fetchAdminUsers({
          search: email || "",
          limit: 1,
          offset: 0,
        });
        const me = (users.items || []).find(
          (item) =>
            item.email?.toLowerCase() === String(email || "").toLowerCase(),
        );
        setPayload({ user: me || null });
      } else {
        setPayload({ items: [], total: 0 });
      }
    } catch (loadError) {
      setError(loadError?.message || "This page could not load live data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [location.pathname, params.id]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Clear the local session regardless of API availability.
    } finally {
      clearAuthUser();
      navigate("/login", { replace: true });
    }
  };

  const content = useMemo(() => {
    if (loading)
      return <p className="admin-empty-copy">Loading live records…</p>;
    if (error) return <p className="admin-empty-copy">{error}</p>;
    if (!payload)
      return <p className="admin-empty-copy">No records returned.</p>;

    if (location.pathname.startsWith("/admin/users")) {
      if (params.id) {
        const user = payload.user;
        if (!user) return <p className="admin-empty-copy">User not found.</p>;
        return (
          <div className="admin-management-detail">
            <section className="admin-data-card admin-detail-card">
              <h2>{user.fullName || user.name}</h2>
              <p>{user.email}</p>
              <p>{user.phone || "No phone number"}</p>
              <p>Role: {user.role}</p>
            </section>
            <section className="admin-detail-grid">
              <article className="admin-data-card">
                <small>Wallet balance</small>
                <strong>{formatNaira(user.walletBalance)}</strong>
              </article>
              <article className="admin-data-card">
                <small>Purchases</small>
                <strong>{user.numbers?.length || 0}</strong>
              </article>
              <article className="admin-data-card">
                <small>Transactions</small>
                <strong>{user.transactions?.length || 0}</strong>
              </article>
              <article className="admin-data-card">
                <small>Deposits</small>
                <strong>{user.deposits?.length || 0}</strong>
              </article>
            </section>
          </div>
        );
      }
      const users = payload.items || [];
      return (
        <div className="admin-table-wrap">
          <table className="admin-recent-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th>Wallet</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </td>
                  <td>{user.phone || "Not reported"}</td>
                  <td>{formatNaira(user.walletBalance)}</td>
                  <td>{user.role}</td>
                  <td>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (location.pathname.startsWith("/admin/purchases")) {
      const purchases = payload.items || [];
      return (
        <div className="admin-table-wrap">
          <table className="admin-recent-table">
            <thead>
              <tr>
                <th>Purchase</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.id}</strong>
                    <small>{item.number}</small>
                  </td>
                  <td>
                    {item.customerName}
                    <small>{item.customerEmail}</small>
                  </td>
                  <td>
                    {item.service}
                    <small>{item.countryName}</small>
                  </td>
                  <td>{formatNaira(item.priceValue)}</td>
                  <td>{item.status || "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (location.pathname.startsWith("/admin/transactions")) {
      const transactions = payload.items || [];
      return (
        <div className="admin-table-wrap">
          <table className="admin-recent-table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.reference || item.id}</strong>
                    <small>{item.title}</small>
                  </td>
                  <td>
                    {item.customerName}
                    <small>{item.customerEmail}</small>
                  </td>
                  <td>{item.type}</td>
                  <td>{formatNaira(item.amount)}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (location.pathname === "/admin/payments") {
      const deposits = payload.deposits || payload;
      const items = deposits.items || [];
      const summary = payload.summary || null;
      const provider = summary?.provider;
      const credited =
        summary?.deposits?.credited ??
        items.filter((item) => String(item.status).toUpperCase() === "CREDITED")
          .length;
      return (
        <div>
          <div className="admin-detail-grid">
            <article className="admin-data-card">
              <small>Wallet liabilities</small>
              <strong>{formatNaira(summary?.wallets?.liabilities)}</strong>
            </article>
            <article className="admin-data-card">
              <small>Confirmed deposits</small>
              <strong>{formatNaira(summary?.deposits?.creditedTotal)}</strong>
              <p>{credited} credited</p>
            </article>
            <article className="admin-data-card">
              <small>Pending</small>
              <strong>{summary?.deposits?.pending ?? "—"}</strong>
            </article>
            <article className="admin-data-card">
              <small>Failed</small>
              <strong>{summary?.deposits?.failed ?? "—"}</strong>
            </article>
            <article className="admin-data-card">
              <small>Provider</small>
              <strong>
                {provider ? String(provider.mode).toUpperCase() : "—"}
              </strong>
              <p>
                {provider?.configured
                  ? "Configured"
                  : `Not configured: ${(provider?.missing || []).join(", ")}`}
              </p>
            </article>
            <article className="admin-data-card">
              <small>Virtual accounts</small>
              <strong>{summary?.accounts?.active ?? "—"} active</strong>
              <p>{summary?.accounts?.total ?? 0} total</p>
            </article>
          </div>
          <section
            className="admin-data-card"
            style={{ marginTop: 14, padding: 14 }}
          >
            <h2>Recent deposits</h2>
            {items.length ? (
              <div className="admin-table-wrap">
                <table className="admin-recent-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.reference || item.id}</strong>
                        </td>
                        <td>
                          {item.customerName ||
                            item.customerEmail ||
                            "Customer"}
                        </td>
                        <td>{formatNaira(item.amount)}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-empty-copy">
                No deposit records were returned.
              </p>
            )}
          </section>
        </div>
      );
    }

    if (location.pathname === "/admin/inventory") {
      const cards = payload.cards || payload.items || [];
      return (
        <div className="admin-detail-grid">
          {cards.slice(0, 24).map((card, index) => (
            <article
              className="admin-data-card"
              key={card.id || card.service || index}
            >
              <small>
                {card.countryName || card.country || "Provider inventory"}
              </small>
              <strong>
                {card.name || card.service || card.serviceId || "Service"}
              </strong>
              {card.price != null && <p>{formatNaira(card.price)}</p>}
            </article>
          ))}
        </div>
      );
    }

    if (location.pathname === "/admin/staff") {
      const staff = (payload.items || []).filter(
        (user) => user.role !== "customer",
      );
      return (
        <div className="admin-table-wrap">
          <table className="admin-recent-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                  </td>
                  <td>{user.role}</td>
                  <td>{user.email}</td>
                  <td>{user.phone || "Not reported"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (location.pathname === "/admin/profile") {
      const user = payload.user;
      return (
        <section className="admin-data-card admin-detail-card">
          <h2>
            {user?.fullName || getAuthUser()?.fullName || "Administrator"}
          </h2>
          <p>{user?.email || getAuthUser()?.email}</p>
          <p>Role: {user?.role || getAuthUser()?.role}</p>
        </section>
      );
    }

    return (
      <section className="admin-data-card admin-detail-card">
        <h2>{pageTitle}</h2>
        <p>
          This module is connected to the protected admin route.
          Backend-specific records and write actions will appear here as each
          management endpoint is enabled.
        </p>
      </section>
    );
  }, [
    error,
    loading,
    location.pathname,
    navigate,
    pageTitle,
    params.id,
    payload,
  ]);

  return (
    <main className="admin-dashboard-shell">
      {sidebarOpen && (
        <button
          type="button"
          className="admin-mobile-overlay"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`admin-dashboard-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="admin-side-brand">
          <div className="admin-side-logo">P</div>
          <div>
            <strong>Panda Number</strong>
            <span>
              <FiShield /> Admin Panel
            </span>
          </div>
          <button
            type="button"
            className="admin-side-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <FiX />
          </button>
        </div>
        <nav className="admin-side-nav" aria-label="Admin navigation">
          {navigation.map(({ label, path, Icon }) => (
            <button
              type="button"
              key={path}
              className={`admin-side-item${location.pathname === path ? " active" : ""}`}
              onClick={() => {
                setSidebarOpen(false);
                navigate(path);
              }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="admin-side-logout"
          onClick={handleLogout}
        >
          <FiLogOut />
          <span>Log out</span>
        </button>
      </aside>

      <section className="admin-dashboard-main">
        <header className="admin-dashboard-header">
          <button
            type="button"
            className="admin-menu-button"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <FiMenu />
          </button>
          <div>
            <span>Admin Console</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="admin-header-actions">
            <button
              type="button"
              className="admin-header-icon"
              aria-label="Notifications"
              onClick={() => navigate("/admin/notifications")}
            >
              <FiBell />
            </button>
            <button
              type="button"
              className="admin-header-icon"
              aria-label="Toggle theme"
            >
              <FiMoon />
            </button>
            <button
              type="button"
              className="admin-profile-button"
              aria-label="Administrator profile"
              onClick={() => navigate("/admin/profile")}
            >
              AD <FiChevronDown />
            </button>
          </div>
        </header>

        <div className="admin-dashboard-content">
          <header className="admin-management-heading">
            <div>
              <p className="admin-eyebrow">ADMIN MANAGEMENT</p>
              <h1>{pageTitle}</h1>
            </div>
            <div className="admin-management-tools">
              <label className="admin-table-search">
                <FiSearch />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search live records"
                />
              </label>
              <button
                type="button"
                className="admin-action-button"
                onClick={load}
              >
                <FiRefreshCw /> Refresh
              </button>
            </div>
          </header>
          {content}
        </div>
      </section>
    </main>
  );
}

export default AdminManagement;
