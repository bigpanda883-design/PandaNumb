import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import AppRoutes from "./routes/AppRoutes.jsx";
import "./CSS/PublicDarkMode.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  </StrictMode>,
);
