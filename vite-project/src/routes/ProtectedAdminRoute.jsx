import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { clearAuthUser, getAuthToken } from "../auth/authStorage";
import { fetchAdminStatus } from "../services/apiClient";

function ProtectedAdminRoute() {
  const location = useLocation();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    if (!token) {
      setStatus("login");
      return undefined;
    }
    fetchAdminStatus()
      .then(() => {
        if (!cancelled) setStatus("allowed");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 401) clearAuthUser();
        setStatus(error?.status === 403 ? "customer" : "login");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return null;
  }
  if (status === "customer") {
    return <Navigate to="/dashboard" replace />;
  }
  if (status === "login") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export default ProtectedAdminRoute;
