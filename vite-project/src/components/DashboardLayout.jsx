import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import DashboardHeader from "./DashboardHeader";
import MobileBottomNav from "./MobileBottomNav";
import Sidebar from "./Sidebar";
import "../CSS/dashboard/Dashboard.css";
import "../CSS/dashboard/DarkMode.css";

function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Stop the page behind the drawer from scrolling while it is open.
  // (Every drawer link, the overlay and the close button all call onClose,
  // so the drawer is never left open behind the next page.)
  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="dashboard-app">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      <div className="dashboard-main-shell">
        <DashboardHeader onMenuToggle={() => setIsSidebarOpen(true)} />
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

export default DashboardLayout;
