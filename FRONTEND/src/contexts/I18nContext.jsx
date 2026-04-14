import PropTypes from "prop-types";
import { createContext, useContext, useMemo } from "react";

import { createTranslator } from "../i18n/index.js";

const I18nContext = createContext({ locale: "es", t: (k) => k });

export const I18nProvider = ({ children, locale = "es" }) => {
  const value = useMemo(() => {
    const t = createTranslator(locale);
    return { locale, t };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);

I18nProvider.propTypes = {
  children: PropTypes.node,
  locale: PropTypes.string,
};
