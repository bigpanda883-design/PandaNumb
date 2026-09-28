import { BrowserRouter, Route, Routes } from "react-router-dom";
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
            <Route path="/active-sms" element={<ActiveSMS />} />
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
