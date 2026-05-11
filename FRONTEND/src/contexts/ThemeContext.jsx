import PropTypes from "prop-types";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "seeds_theme";
const DENSITY_STORAGE_KEY = "seeds_density";

const ThemeContext = createContext({
  theme: "light",
  density: "comfortable",
  setTheme: () => {},
  toggleTheme: () => {},
  setDensity: () => {},
  toggleDensity: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem(STORAGE_KEY) || "light";
  });
  const [density, setDensity] = useState(() => {
    if (typeof window === "undefined") return "comfortable";
    const v = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return v === "compact" ? "compact" : "comfortable";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);

  const value = useMemo(
    () => ({
      theme,
      density,
      setTheme,
      setDensity,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      toggleDensity: () => setDensity((d) => (d === "compact" ? "comfortable" : "compact")),
    }),
    [theme, density],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

ThemeProvider.propTypes = {
  children: PropTypes.node,
};
