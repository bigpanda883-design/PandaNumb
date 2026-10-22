import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import DashboardHeader from "./DashboardHeader";
import MobileBottomNav from "./MobileBottomNav";
import Sidebar from "./Sidebar";
import WhatsAppAnnouncementPopup from "./WhatsAppAnnouncementPopup";
import "../CSS/dashboard/Dashboard.css";
import "../CSS/dashboard/DarkMode.css";
import "../CSS/dashboard/PageTransitions.css";

function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Keying the wrapper on the path re-runs the entrance animation on every
  // dashboard navigation without touching any individual page.
  const { pathname } = useLocation();
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsSidebarOpen(false);
  }
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
          <div className="dashboard-page-transition" key={pathname}>
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav />
      {/* Shown once per session after entering the dashboard. */}
      <WhatsAppAnnouncementPopup />
    </div>
  );
}

export default DashboardLayout;
