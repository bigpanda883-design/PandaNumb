import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "../App";
import DashboardLayout from "../components/DashboardLayout";
import ActiveSMS from "../pages/ActiveSMS";
import Buy from "../pages/Buy";
import DashboardHome from "../pages/DashboardHome";
import Deposit from "../pages/Deposit";
import HelpCenter from "../pages/HelpCenter";
import MyNumbers from "../pages/MyNumbers";
import Notifications from "../pages/Notifications";
import Profile from "../pages/Profile";
import Security from "../pages/Security";
import Transactions from "../pages/Transactions";
import Login from "../pages/auth/Login";
import SignUp from "../pages/auth/SignUp";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import NotFound from "../pages/NotFound";
import ScrollToTop from "../components/ScrollToTop";
import ProtectedRoute from "./ProtectedRoute";
import ProtectedAdminRoute from "./ProtectedAdminRoute";
import AdminLayout from "../pages/admin/AdminLayout";
import AdminDashboard from "../pages/admin/AdminDashboard";
import UsersPage from "../pages/admin/UsersPage";
import PurchasesPage from "../pages/admin/PurchasesPage";
import TransactionsPage from "../pages/admin/TransactionsPage";
import InventoryPage from "../pages/admin/InventoryPage";
import PaymentsPage from "../pages/admin/PaymentsPage";
import StaffPage from "../pages/admin/StaffPage";
import AnnouncementsPage from "../pages/admin/AnnouncementsPage";
import SupportPage from "../pages/admin/SupportPage";
import ActivityLogsPage from "../pages/admin/ActivityLogsPage";
import SettingsPage from "../pages/admin/SettingsPage";
import NotificationsPage from "../pages/admin/NotificationsPage";

function AppRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/admin/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/help" element={<Navigate to="/help-center" replace />} />
        <Route element={<ProtectedAdminRoute />}>
          {/* One shared shell for every admin page, one page component per route. */}
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:id" element={<UsersPage />} />
            <Route path="/admin/purchases" element={<PurchasesPage />} />
            <Route path="/admin/transactions" element={<TransactionsPage />} />
            <Route path="/admin/inventory" element={<InventoryPage />} />
            <Route path="/admin/payments" element={<PaymentsPage />} />
            <Route path="/admin/staff" element={<StaffPage />} />
            <Route
              path="/admin/announcements"
              element={<AnnouncementsPage />}
            />
            <Route path="/admin/support" element={<SupportPage />} />
            <Route
              path="/admin/activity-logs"
              element={<ActivityLogsPage />}
            />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route
              path="/admin/notifications"
              element={<NotificationsPage />}
            />
            {/* Legacy links keep working: /admin/profile is Settings, and the
                two retired modules bounce to the page that covers them. */}
            <Route path="/admin/profile" element={<SettingsPage />} />
            <Route
              path="/admin/reports"
              element={<Navigate to="/admin/dashboard" replace />}
            />
            <Route
              path="/admin/referrals"
              element={<Navigate to="/admin/users" replace />}
            />
            {/* Anything else under /admin falls back to the Overview, so no
                admin link can ever land on a blank screen. */}
            <Route
              path="/admin/*"
              element={<Navigate to="/admin/dashboard" replace />}
            />
          </Route>
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/buy" element={<Buy />} />
            <Route path="/my-numbers" element={<MyNumbers />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/deposit" element={<Deposit />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/help-center" element={<HelpCenter />} />
            {/* Renamed from "Active SMS" to "Active Logs". The old path keeps
                working via a redirect so existing links never hit a 404. */}
            <Route path="/active-logs" element={<ActiveSMS />} />
            <Route
              path="/active-sms"
              element={<Navigate to="/active-logs" replace />}
            />
            <Route path="/security" element={<Security />} />
          </Route>
        </Route>
        {/* Unknown URLs get a real 404 instead of silently bouncing to "/". */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
