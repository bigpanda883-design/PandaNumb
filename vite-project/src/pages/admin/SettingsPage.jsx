import { useState } from "react";
import {
  FiCheckCircle,
  FiCreditCard,
  FiEye,
  FiLock,
  FiMonitor,
  FiSave,
  FiServer,
  FiSliders,
  FiUser,
  FiXCircle,
} from "react-icons/fi";
import {
  endOtherSessions,
  endSession,
  fetchAdminSettings,
  saveAdminPreferences,
  saveAdminProfile,
} from "../../services/apiClient";
import useAsyncResource from "../../hooks/useAsyncResource";
import { formatDate, formatDuration, formatNumber } from "./format";
import { EmptyState, ErrorState, LoadingState, Notice } from "./adminUi";
// Shared admin shell + primitives, then this page's own stylesheet.
import "../../CSS/dashboard/admin/admin.css";
import "../../CSS/dashboard/admin/AdminSettings.css";

const SECTIONS = [
  { id: "account", label: "Account & Profile", icon: FiUser },
  { id: "appearance", label: "Appearance", icon: FiSliders },
  { id: "security", label: "Security", icon: FiLock },
  { id: "privacy", label: "Privacy", icon: FiEye },
  { id: "payments", label: "Payment Configuration", icon: FiCreditCard },
  { id: "system", label: "System Configuration", icon: FiServer },
];

/**
 * Settings & Security.
 *
 * Every Save button calls the API and reports what the server answered. The
 * Payment and System sections are read-only status: secrets live on the server
 * and are never sent to the browser, and nothing here can switch a provider.
 */
function SettingsPage() {
  const [section, setSection] = useState("account");
  const [notice, setNotice] = useState(null);

  const {
    loading,
    error,
    data: settings,
    refresh,
    reload,
  } = useAsyncResource(() => fetchAdminSettings(), []);

  if (error && !settings) {
    return <ErrorState message={error} onRetry={refresh} />;
  }
  if (loading || !settings) {
    return <LoadingState label="Loading settings…" />;
  }

  return (
    <div className="admin-page-body admin-settings-page">
      {notice ? (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.message}
        </Notice>
      ) : null}

      <div className="admin-settings-layout">
        <nav className="admin-settings-nav" aria-label="Settings sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`admin-settings-nav-item${section === id ? " active" : ""}`}
              onClick={() => setSection(id)}
            >
              <Icon /> <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="admin-settings-content">
          {section === "account" && (
            <AccountSection
              settings={settings}
              onNotice={setNotice}
              onSaved={reload}
            />
          )}
          {section === "appearance" && (
            <AppearanceSection
              settings={settings}
              onNotice={setNotice}
              onSaved={reload}
            />
          )}
          {section === "security" && (
            <SecuritySection
              settings={settings}
              onNotice={setNotice}
              onSaved={reload}
            />
          )}
          {section === "privacy" && (
            <PrivacySection
              settings={settings}
              onNotice={setNotice}
              onSaved={reload}
            />
          )}
          {section === "payments" && <PaymentsSection settings={settings} />}
          {section === "system" && (
            <SystemSection settings={settings} onReload={refresh} />
          )}
        </div>
      </div>
    </div>
  );
}

function AccountSection({ settings, onNotice, onSaved }) {
  const [fullName, setFullName] = useState(settings.profile.fullName || "");
  // The sign-in email is displayed but not editable here: the server owns it.
  const email = settings.profile.email || "";
  const [phone, setPhone] = useState(settings.profile.phone || "");
  const [avatar, setAvatar] = useState(settings.profile.avatar || "");
  const [saving, setSaving] = useState(false);

  const pickImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      onNotice({
        tone: "error",
        message: "Choose an image smaller than 300 KB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveAdminProfile({ fullName, phone, email, avatar });
      onNotice({ tone: "success", message: "Profile saved." });
      onSaved();
    } catch (saveError) {
      onNotice({
        tone: "error",
        message: saveError?.message || "The profile could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <div>
          <h2>Account &amp; Profile</h2>
          <p>How you appear in the admin console and on audit records.</p>
        </div>
      </header>
      <form className="admin-form" onSubmit={save}>
        <div className="admin-avatar-row">
          <span className="admin-avatar-preview">
            {avatar ? (
              <img src={avatar} alt="" />
            ) : (
              (fullName || "A").charAt(0).toUpperCase()
            )}
          </span>
          <div>
            <label className="admin-ghost-button admin-file-button">
              Change picture
              <input type="file" accept="image/*" onChange={pickImage} />
            </label>
            {avatar ? (
              <button
                type="button"
                className="admin-link-button muted"
                onClick={() => setAvatar("")}
              >
                Remove
              </button>
            ) : null}
            <p className="admin-muted-copy">PNG or JPG, up to 300 KB.</p>
          </div>
        </div>

        <label className="admin-field">
          <span>Full name</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>
        <label className="admin-field">
          <span>Email</span>
          <input value={email} readOnly disabled />
          <small className="admin-muted-copy">
            The sign-in email cannot be changed from this screen.
          </small>
        </label>
        <label className="admin-field">
          <span>Phone number</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+234 800 000 0000"
          />
        </label>

        <div className="admin-form-actions">
          <button
            type="submit"
            className="admin-action-button"
            disabled={saving}
          >
            <FiSave /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AppearanceSection({ settings, onNotice, onSaved }) {
  const [prefs, setPrefs] = useState(settings.preferences);
  const [saving, setSaving] = useState(false);

  const apply = (patch) => setPrefs((current) => ({ ...current, ...patch }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveAdminPreferences({
        theme: prefs.theme,
        sidebarCollapsed: prefs.sidebarCollapsed,
        interfaceScale: prefs.interfaceScale,
        tableDensity: prefs.tableDensity,
      });
      onNotice({
        tone: "success",
        message: "Preferences saved - they apply on your next sign-in too.",
      });
      onSaved();
    } catch (saveError) {
      onNotice({
        tone: "error",
        message: saveError?.message || "Preferences could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <div>
          <h2>Appearance &amp; Preferences</h2>
          <p>Saved to your account, so they follow you to any device.</p>
        </div>
      </header>
      <form className="admin-form" onSubmit={save}>
        <fieldset className="admin-fieldset">
          <legend>Theme</legend>
          <div className="admin-choice-row">
            {["light", "dark"].map((theme) => (
              <button
                key={theme}
                type="button"
                className={`admin-choice${prefs.theme === theme ? " active" : ""}`}
                onClick={() => apply({ theme })}
              >
                {theme === "light" ? "Light mode" : "Dark mode"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Table density</legend>
          <div className="admin-choice-row">
            {["comfortable", "compact"].map((density) => (
              <button
                key={density}
                type="button"
                className={`admin-choice${prefs.tableDensity === density ? " active" : ""}`}
                onClick={() => apply({ tableDensity: density })}
              >
                {density === "compact" ? "Compact" : "Comfortable"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Interface scaling</legend>
          <div className="admin-choice-row">
            {[90, 100, 110, 125].map((scale) => (
              <button
                key={scale}
                type="button"
                className={`admin-choice${prefs.interfaceScale === scale ? " active" : ""}`}
                onClick={() => apply({ interfaceScale: scale })}
              >
                {scale}%
              </button>
            ))}
          </div>
        </fieldset>

        <label className="admin-toggle-row">
          <span>
            <strong>Collapse the sidebar by default</strong>
            <small>Keeps more room for tables on a small screen.</small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(prefs.sidebarCollapsed)}
            onChange={(event) =>
              apply({ sidebarCollapsed: event.target.checked })
            }
          />
        </label>

        <div className="admin-form-actions">
          <button
            type="submit"
            className="admin-action-button"
            disabled={saving}
          >
            <FiSave /> {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </form>
    </section>
  );
}

function SecuritySection({ settings, onNotice }) {
  const [twoFactor, setTwoFactor] = useState(
    Boolean(settings.preferences.twoFactorEnabled),
  );
  const [alerts, setAlerts] = useState(
    settings.preferences.securityAlerts !== false,
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveAdminPreferences({
        twoFactorEnabled: twoFactor,
        securityAlerts: alerts,
      });
      onNotice({ tone: "success", message: "Security preferences saved." });
    } catch (saveError) {
      onNotice({
        tone: "error",
        message: saveError?.message || "Could not save security preferences.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <div>
          <h2>Security</h2>
          <p>Password, two-factor authentication and recent sign-ins.</p>
        </div>
      </header>

      <div className="admin-settings-block">
        <h3>Change password</h3>
        <p className="admin-muted-copy">
          For your protection, passwords are changed on the Security page of
          your own account, where the current password is verified.
        </p>
        <a className="admin-ghost-button" href="/security">
          Open password settings
        </a>
      </div>

      <div className="admin-settings-block">
        <h3>Two-factor authentication</h3>
        <label className="admin-toggle-row">
          <span>
            <strong>Require a second factor at sign-in</strong>
            <small>
              {settings.security.twoFactorAvailable
                ? "A code from your authenticator app will be required."
                : "Not available on this server yet - the preference is saved and takes effect once setup is enabled."}
            </small>
          </span>
          <input
            type="checkbox"
            checked={twoFactor}
            onChange={(event) => setTwoFactor(event.target.checked)}
          />
        </label>
        <label className="admin-toggle-row">
          <span>
            <strong>Email me about security events</strong>
            <small>Sign-ins from a new device and password changes.</small>
          </span>
          <input
            type="checkbox"
            checked={alerts}
            onChange={(event) => setAlerts(event.target.checked)}
          />
        </label>
        <button
          type="button"
          className="admin-action-button"
          onClick={save}
          disabled={saving}
        >
          <FiSave /> {saving ? "Saving…" : "Save security settings"}
        </button>
      </div>

      <div className="admin-settings-block">
        <h3>Login history</h3>
        {settings.security.recentLogins?.length ? (
          <ul className="admin-timeline">
            {settings.security.recentLogins.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.actionLabel}</strong>
                <span>{formatDate(entry.createdAt)}</span>
                <small>{entry.ipAddress || "IP not recorded"}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-muted-copy">No sign-ins recorded yet.</p>
        )}
      </div>
    </section>
  );
}

function PrivacySection({ settings, onNotice, onSaved }) {
  const [working, setWorking] = useState(false);

  const signOutOthers = async () => {
    setWorking(true);
    try {
      const result = await endOtherSessions();
      onNotice({
        tone: "success",
        message: `Signed out ${result?.removed ?? 0} other session(s).`,
      });
      onSaved();
    } catch (endError) {
      onNotice({
        tone: "error",
        message: endError?.message || "Could not sign out other sessions.",
      });
    } finally {
      setWorking(false);
    }
  };

  const endOne = async (session) => {
    setWorking(true);
    try {
      await endSession(session.id);
      onNotice({ tone: "success", message: "Session ended." });
      onSaved();
    } catch (endError) {
      onNotice({
        tone: "error",
        message: endError?.message || "Could not end that session.",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <div>
          <h2>Privacy &amp; Sessions</h2>
          <p>Devices currently signed in to this account.</p>
        </div>
        <button
          type="button"
          className="admin-ghost-button"
          onClick={signOutOthers}
          disabled={working}
        >
          <FiMonitor /> Sign out other sessions
        </button>
      </header>

      {settings.sessions.length === 0 ? (
        <EmptyState title="No active sessions" />
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>IP address</th>
                <th>Started</th>
                <th>Last active</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {settings.sessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <strong>{describeDevice(session.userAgent)}</strong>
                    {session.current ? <small>This device</small> : null}
                  </td>
                  <td>{session.ipAddress || "—"}</td>
                  <td>{formatDate(session.createdAt)}</td>
                  <td>{formatDate(session.lastSeenAt || session.createdAt)}</td>
                  <td>
                    {session.current ? (
                      <span className="admin-muted-copy">Current</span>
                    ) : (
                      <button
                        type="button"
                        className="admin-link-button danger"
                        onClick={() => endOne(session)}
                        disabled={working}
                      >
                        End session
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaymentsSection({ settings }) {
  const payments = settings.payments;
  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <div>
          <h2>Payment Configuration</h2>
          <p>Connection status only. Credentials never leave the server.</p>
        </div>
      </header>

      <div className="admin-status-grid">
        <StatusTile
          label="Provider"
          value={payments.provider}
          ok={payments.configured}
          hint={
            payments.configured
              ? `Mode: ${payments.mode}`
              : `Missing: ${(payments.missing || []).join(", ")}`
          }
        />
        <StatusTile
          label="Virtual accounts"
          value={`${formatNumber(payments.accounts.active)} active`}
          ok={payments.accounts.active > 0}
          hint={`${formatNumber(payments.accounts.total)} total · ${formatNumber(payments.accounts.pending)} pending`}
        />
        <StatusTile
          label="Webhook health"
          value={`${formatNumber(payments.webhooks.processed)} processed`}
          ok={payments.webhooks.total > 0}
          hint={
            payments.webhooks.lastReceivedAt
              ? `Last event ${formatDate(payments.webhooks.lastReceivedAt)}`
              : "No webhook received yet"
          }
        />
        <StatusTile
          label="Confirmed deposits"
          value={formatNumber(payments.deposits.credited)}
          ok
          hint={`${formatNumber(payments.deposits.pending)} pending · ${formatNumber(payments.deposits.failed)} failed`}
        />
      </div>

      <Notice tone="info">
        Changing payment credentials or switching provider is an authorised
        server-side operation and is deliberately not available from this
        screen.
      </Notice>
    </section>
  );
}

function SystemSection({ settings, onReload }) {
  const system = settings.system;
  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <div>
          <h2>System Configuration</h2>
          <p>
            Live status read from the server at {formatDate(system.checkedAt)}.
          </p>
        </div>
        <button type="button" className="admin-ghost-button" onClick={onReload}>
          Re-check status
        </button>
      </header>

      <div className="admin-status-grid">
        <StatusTile
          label="Server"
          value={system.server.ok ? "Running" : "Down"}
          ok={system.server.ok}
          hint={`Node ${system.server.node} · up ${formatDuration(system.server.uptimeSeconds)}`}
        />
        <StatusTile
          label="Database"
          value={system.database.connected ? "Connected" : "Not reachable"}
          ok={system.database.connected}
          hint={`${formatNumber(system.database.users)} accounts`}
        />
        <StatusTile
          label="Number provider"
          value={
            system.inventoryProvider.connected ? "Connected" : "Unavailable"
          }
          ok={system.inventoryProvider.connected}
          hint={
            system.inventoryProvider.lastFetchedAt
              ? `Last fetch ${formatDate(system.inventoryProvider.lastFetchedAt)}`
              : "No successful fetch yet"
          }
        />
        <StatusTile
          label="Payment gateway"
          value={
            system.paymentProvider.configured
              ? `Configured (${system.paymentProvider.mode})`
              : "Not configured"
          }
          ok={system.paymentProvider.configured}
          hint={system.paymentProvider.name}
        />
      </div>

      <div className="admin-settings-block">
        <h3>Maintenance mode</h3>
        <p className="admin-muted-copy">
          Stored as a server-side flag. It is shown here for visibility;
          switching it affects the storefront and is handled by the deployment,
          not this UI. Current state:{" "}
          <strong>{system.maintenanceMode ? "On" : "Off"}</strong>.
        </p>
      </div>
    </section>
  );
}

function StatusTile({ label, value, ok, hint }) {
  return (
    <article className={`admin-status-tile ${ok ? "is-ok" : "is-bad"}`}>
      <span className="admin-status-tile-icon">
        {ok ? <FiCheckCircle /> : <FiXCircle />}
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {hint ? <p>{hint}</p> : null}
      </div>
    </article>
  );
}

function describeDevice(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export default SettingsPage;
