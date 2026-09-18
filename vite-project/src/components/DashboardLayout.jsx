import { Outlet } from "react-router-dom";
import DashboardHeader from "./DashboardHeader";
import MobileBottomNav from "./MobileBottomNav";
import Sidebar from "./Sidebar";
import "../CSS/dashboard/Dashboard.css";
import "../CSS/dashboard/DarkMode.css";

function DashboardLayout() {
  return (
    <div className="dashboard-app">
      <Sidebar />
      <div className="dashboard-main-shell">
        <DashboardHeader />
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

export default DashboardLayout;
