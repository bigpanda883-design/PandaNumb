import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "../App";
import DashboardLayout from "../components/DashboardLayout";
import ActiveSMS from "../pages/ActiveSMS";
import AdminPayments from "../pages/AdminPayments";
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
import NotFound from "../pages/NotFound";
import ScrollToTop from "../components/ScrollToTop";
import ProtectedRoute from "./ProtectedRoute";

function AppRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/help" element={<Navigate to="/help-center" replace />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/admin/payments" element={<AdminPayments />} />
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
