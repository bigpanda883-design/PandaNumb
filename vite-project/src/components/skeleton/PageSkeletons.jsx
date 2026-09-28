/**
 * Page skeleton layouts
 * ---------------------
 * Each export mirrors the real page's structure (same class names for the
 * outer shells, same grid/flex rhythm) so the placeholder occupies the exact
 * space the content will. Pages render one of these while data is loading and
 * the real markup otherwise, which is why nothing here duplicates loading
 * logic per feature.
 */
import { Skeleton, SkeletonText, SkeletonRepeat } from "./Skeleton";
import "./PageSkeletons.css";

/* -------------------------------------------------------------------------- */
/* Dashboard home                                                             */
/* -------------------------------------------------------------------------- */
export function DashboardHomeSkeleton() {
  return (
    <div className="dashboard-home-wrapper sk-page" aria-busy="true">
      <div className="dashboard-home-container">
        {/* Blue balance banner */}
        <div className="sk-balance-banner">
          <div className="sk-balance-top">
            <Skeleton width="150px" height="16px" radius="8px" />
            <Skeleton width="120px" height="30px" radius="18px" />
          </div>
          <div className="sk-balance-amount">
            <Skeleton width="240px" height="40px" radius="10px" />
          </div>
          <div className="sk-balance-actions">
            <Skeleton width="100%" height="46px" radius="24px" />
            <Skeleton width="100%" height="46px" radius="24px" />
          </div>
        </div>

        {/* Stat cards */}
        <section className="stats-cards-grid">
          <SkeletonRepeat count={4}>
            {() => (
              <div className="stat-card sk-card">
                <Skeleton width="36px" height="36px" circle />
                <Skeleton width="60px" height="18px" radius="6px" />
                <Skeleton width="100px" height="12px" radius="6px" />
              </div>
            )}
          </SkeletonRepeat>
        </section>

        {/* Popular services */}
        <section className="popular-services-section">
          <div className="section-header-row">
            <Skeleton width="150px" height="20px" radius="8px" />
            <Skeleton width="100px" height="20px" radius="8px" />
          </div>
          <div className="popular-services-grid">
            <SkeletonRepeat count={4}>
              {() => (
                <div className="service-card sk-card">
                  <Skeleton width="40px" height="40px" circle />
                  <Skeleton width="80px" height="14px" radius="6px" />
                  <Skeleton width="60px" height="11px" radius="6px" />
                </div>
              )}
            </SkeletonRepeat>
          </div>
        </section>

        {/* Recent transactions */}
        <section className="recent-transactions-section">
          <div className="section-header-row">
            <Skeleton width="180px" height="20px" radius="8px" />
            <Skeleton width="80px" height="20px" radius="8px" />
          </div>
          <TransactionRowsSkeleton rows={3} />
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared row / list blocks                                                   */
/* -------------------------------------------------------------------------- */
export function TransactionRowsSkeleton({ rows = 5 }) {
  return (
    <div className="transaction-list sk-list">
      <SkeletonRepeat count={rows}>
        {() => (
          <div className="transaction-row sk-row">
            <Skeleton width="40px" height="40px" circle />
            <div className="sk-row-copy">
              <Skeleton width="70%" height="14px" radius="6px" />
              <Skeleton width="45%" height="11px" radius="6px" />
            </div>
            <div className="sk-row-end">
              <Skeleton width="80px" height="14px" radius="6px" />
              <Skeleton width="60px" height="14px" radius="10px" />
            </div>
          </div>
        )}
      </SkeletonRepeat>
    </div>
  );
}

export function CardListSkeleton({ rows = 4, height = "64px" }) {
  return (
    <div className="sk-list">
      <SkeletonRepeat count={rows}>
        {() => (
          <div className="sk-row" style={{ minHeight: height }}>
            <Skeleton width="40px" height="40px" circle />
            <div className="sk-row-copy">
              <Skeleton width="65%" height="14px" radius="6px" />
              <Skeleton width="40%" height="11px" radius="6px" />
            </div>
            <Skeleton width="70px" height="22px" radius="12px" />
          </div>
        )}
      </SkeletonRepeat>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header (title + subtitle), reused by most pages                       */
/* -------------------------------------------------------------------------- */
export function PageHeaderSkeleton({ titleWidth = "180px" }) {
  return (
    <div className="sk-page-header">
      <Skeleton width={titleWidth} height="30px" radius="8px" />
      <Skeleton width="260px" height="15px" radius="6px" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Transactions                                                               */
/* -------------------------------------------------------------------------- */
export function TransactionsSkeleton() {
  return (
    <section className="transactions-page sk-page" aria-busy="true">
      <PageHeaderSkeleton titleWidth="200px" />
      <div className="tx-tabs-container">
        <SkeletonRepeat count={4}>
          {() => <Skeleton width="92px" height="36px" radius="18px" />}
        </SkeletonRepeat>
      </div>
      <div className="tx-content-area">
        <div className="tx-list">
          <SkeletonRepeat count={5}>
            {() => (
              <div className="tx-card-row sk-row">
                <div className="tx-left">
                  <Skeleton width="40px" height="40px" circle />
                  <div className="sk-row-copy">
                    <Skeleton width="70%" height="14px" radius="6px" />
                    <Skeleton width="45%" height="11px" radius="6px" />
                  </div>
                </div>
                <div className="tx-right">
                  <Skeleton width="80px" height="14px" radius="6px" />
                  <Skeleton width="70px" height="16px" radius="10px" />
                </div>
              </div>
            )}
          </SkeletonRepeat>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* My Numbers                                                                 */
/* -------------------------------------------------------------------------- */
export function MyNumbersSkeleton() {
  return (
    <div className="mynumbers-page-wrapper sk-page" aria-busy="true">
      <div className="mynumbers-container">
        <PageHeaderSkeleton titleWidth="180px" />
        <div className="numbers-cards-flex">
          <SkeletonRepeat count={3}>
            {() => (
              <div className="number-item-card sk-row">
                <div className="item-card-left">
                  <Skeleton width="44px" height="44px" circle />
                  <div className="item-info">
                    <Skeleton width="150px" height="16px" radius="6px" />
                    <Skeleton width="200px" height="12px" radius="6px" />
                    <Skeleton width="110px" height="18px" radius="6px" />
                  </div>
                </div>
                <div className="item-card-right">
                  <Skeleton width="80px" height="15px" radius="6px" />
                  <Skeleton width="90px" height="20px" radius="12px" />
                </div>
              </div>
            )}
          </SkeletonRepeat>
        </div>
      </div>
    </div>
  );
}

/** Verification-codes detail view. */
export function VerificationCodesSkeleton() {
  return (
    <div className="mynumbers-page-wrapper sk-page" aria-busy="true">
      <div className="mynumbers-container">
        <div className="mynumbers-header">
          <Skeleton width="38px" height="38px" circle />
          <Skeleton width="220px" height="24px" radius="8px" />
        </div>
        <div className="number-card-banner sk-banner">
          <Skeleton width="220px" height="14px" radius="6px" />
          <div style={{ height: "12px" }} />
          <Skeleton width="260px" height="32px" radius="8px" />
          <div style={{ height: "12px" }} />
          <Skeleton width="200px" height="12px" radius="6px" />
        </div>
        <div className="inbox-section-header">
          <Skeleton width="70px" height="18px" radius="6px" />
          <Skeleton width="90px" height="30px" radius="20px" />
        </div>
        <div className="sk-panel">
          <SkeletonText lines={2} width="70%" />
          <div style={{ height: "16px" }} />
          <Skeleton width="140px" height="38px" radius="24px" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Buy a number                                                               */
/* -------------------------------------------------------------------------- */
export function BuySkeleton() {
  return (
    <section className="buy-flow-container sk-page" aria-busy="true">
      <header className="buy-header">
        <div className="buy-header-left">
          <Skeleton width="38px" height="38px" circle />
          <div className="buy-title-group">
            <Skeleton width="160px" height="24px" radius="8px" />
            <Skeleton width="140px" height="13px" radius="6px" />
          </div>
        </div>
        <div className="buy-progress-bar">
          <Skeleton width="100%" height="100%" radius="4px" />
        </div>
      </header>
      <div className="buy-step-content">
        <Skeleton width="160px" height="18px" radius="6px" />
        <div className="services-grid">
          <SkeletonRepeat count={6}>
            {() => (
              <div className="service-card sk-row">
                <Skeleton width="40px" height="40px" radius="10px" />
                <div className="service-details">
                  <Skeleton width="90px" height="15px" radius="6px" />
                  <Skeleton width="80px" height="12px" radius="6px" />
                  <Skeleton width="70px" height="11px" radius="6px" />
                </div>
              </div>
            )}
          </SkeletonRepeat>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Deposit / Fund wallet                                                      */
/* -------------------------------------------------------------------------- */
export function DepositSkeleton() {
  return (
    <div className="deposit-content sk-page" aria-busy="true">
      <PageHeaderSkeleton titleWidth="150px" />
      <div className="balance-card">
        <Skeleton width="120px" height="13px" radius="6px" />
        <div style={{ height: "10px" }} />
        <Skeleton width="180px" height="28px" radius="8px" />
      </div>
      <div className="deposit-card sk-panel">
        <Skeleton width="160px" height="18px" radius="6px" />
        <div style={{ height: "18px" }} />
        <Skeleton width="100%" height="52px" radius="12px" />
        <div style={{ height: "14px" }} />
        <div className="sk-chip-grid">
          <SkeletonRepeat count={4}>
            {() => <Skeleton width="100%" height="42px" radius="12px" />}
          </SkeletonRepeat>
        </div>
        <div style={{ height: "18px" }} />
        <Skeleton width="100%" height="48px" radius="24px" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */
export function ProfileSkeleton() {
  return (
    <section className="profile-page-container sk-page" aria-busy="true">
      <PageHeaderSkeleton titleWidth="120px" />
      <div className="profile-content-wrapper">
        <div className="profile-card user-info-card sk-row">
          <Skeleton width="60px" height="60px" circle />
          <div className="user-details">
            <Skeleton width="140px" height="16px" radius="6px" />
            <Skeleton width="190px" height="13px" radius="6px" />
          </div>
        </div>
        <div className="profile-card profile-form-card sk-panel">
          <SkeletonRepeat count={2}>
            {() => (
              <div className="sk-field">
                <Skeleton width="90px" height="13px" radius="6px" />
                <Skeleton width="100%" height="46px" radius="12px" />
              </div>
            )}
          </SkeletonRepeat>
          <Skeleton width="140px" height="44px" radius="22px" />
        </div>
        <div className="profile-card action-card sk-row">
          <Skeleton width="24px" height="24px" circle />
          <Skeleton width="140px" height="15px" radius="6px" />
        </div>
        <div className="profile-card action-card sk-row">
          <Skeleton width="24px" height="24px" circle />
          <Skeleton width="90px" height="15px" radius="6px" />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */
export function NotificationsSkeleton() {
  return (
    <section className="notifications-page-container sk-page" aria-busy="true">
      <PageHeaderSkeleton titleWidth="200px" />
      <div className="notifications-list-wrapper">
        <SkeletonRepeat count={5}>
          {() => (
            <div className="notification-card sk-card-block">
              <Skeleton width="55%" height="16px" radius="6px" />
              <Skeleton width="80%" height="14px" radius="6px" />
              <Skeleton width="120px" height="12px" radius="6px" />
            </div>
          )}
        </SkeletonRepeat>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Security                                                                   */
/* -------------------------------------------------------------------------- */
export function SecuritySkeleton() {
  return (
    <div className="security-page sk-page" aria-busy="true">
      <PageHeaderSkeleton titleWidth="120px" />
      <div className="security-card sk-panel">
        <div className="security-banner sk-row">
          <Skeleton width="44px" height="44px" radius="12px" />
          <div className="banner-info">
            <Skeleton width="160px" height="18px" radius="6px" />
            <SkeletonText lines={1} width="80%" size="13px" />
          </div>
        </div>
        <div className="security-form">
          <SkeletonRepeat count={3}>
            {() => (
              <div className="sk-field">
                <Skeleton width="120px" height="13px" radius="6px" />
                <Skeleton width="100%" height="46px" radius="12px" />
              </div>
            )}
          </SkeletonRepeat>
          <div className="form-actions-row">
            <Skeleton width="220px" height="40px" radius="20px" />
            <Skeleton width="170px" height="44px" radius="22px" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Help Center                                                                */
/* -------------------------------------------------------------------------- */
export function HelpCenterSkeleton() {
  return (
    <div className="help-center-wrapper sk-page" aria-busy="true">
      <PageHeaderSkeleton titleWidth="170px" />
      <div className="help-cards-container">
        <SkeletonRepeat count={2}>
          {() => (
            <div className="help-card sk-card">
              <Skeleton width="48px" height="48px" radius="14px" />
              <Skeleton width="140px" height="17px" radius="6px" />
              <Skeleton width="160px" height="14px" radius="6px" />
              <Skeleton width="100%" height="42px" radius="21px" />
            </div>
          )}
        </SkeletonRepeat>
      </div>
      <div className="help-faq-card sk-panel">
        <Skeleton width="100%" height="46px" radius="12px" />
        <div style={{ height: "16px" }} />
        <SkeletonRepeat count={4}>
          {() => (
            <div className="sk-faq-row">
              <Skeleton width="60%" height="15px" radius="6px" />
              <Skeleton width="20px" height="20px" circle />
            </div>
          )}
        </SkeletonRepeat>
      </div>
    </div>
  );
}
