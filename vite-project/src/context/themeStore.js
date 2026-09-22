import { createContext, useContext } from "react";

export const THEME_STORAGE_KEY = "panda-numbers-theme";

export const ThemeContext = createContext(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}