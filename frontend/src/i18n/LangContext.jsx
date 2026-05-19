import React, { createContext, useContext, useState } from "react";
import t from "./translations";

const LangContext = createContext(null);

const STORAGE_KEY = "app_lang";
const SUPPORTED = ["en", "fr", "es"];

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(saved) ? saved : "en";
  });

  const setLang = (l) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t: t[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
