import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { theme, ThemeColors } from "./tokens";

export type ThemePreference = "light" | "dark" | "auto";

interface ThemeContextValue {
  colors: ThemeColors;
  preference: ThemePreference;
  isDark: boolean;
  setPreference: (p: ThemePreference) => void;
  /** Bascule jour ⇄ nuit en un geste (bouton de la barre du haut). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Le choix doit survivre à la fermeture de l'application : un agriculteur
// qui travaille de nuit ne doit pas se reprendre un écran blanc en plein
// champ à chaque lancement. SecureStore plutôt qu'AsyncStorage pour rester
// sur les modules natifs déjà embarqués (voir ParcelContext).
const CLE = "rx35.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("auto");

  useEffect(() => {
    SecureStore.getItemAsync(CLE)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "auto") setPreferenceState(v);
      })
      .catch(() => {
        // Lecture impossible : on reste sur "auto", sans casser le démarrage.
      });
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    SecureStore.setItemAsync(CLE, p).catch(() => {});
  };

  const isDark = preference === "auto" ? systemScheme === "dark" : preference === "dark";
  const colors = isDark ? theme.dark : theme.light;

  // Bascule sur ce qui est affiché, pas sur la préférence : depuis "auto"
  // en pleine nuit, un appui donne bien le thème clair.
  const toggleTheme = () => setPreference(isDark ? "light" : "dark");

  const value = useMemo(
    () => ({ colors, preference, isDark, setPreference, toggleTheme }),
    [colors, preference, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme doit être utilisé à l'intérieur de <ThemeProvider>");
  return ctx;
}
