import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { theme, ThemeColors } from "./tokens";

export type ThemePreference = "light" | "dark" | "auto";

interface ThemeContextValue {
  colors: ThemeColors;
  preference: ThemePreference;
  isDark: boolean;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>("auto");

  const isDark = preference === "auto" ? systemScheme === "dark" : preference === "dark";
  const colors = isDark ? theme.dark : theme.light;

  const value = useMemo(
    () => ({ colors, preference, isDark, setPreference }),
    [colors, preference, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme doit être utilisé à l'intérieur de <ThemeProvider>");
  return ctx;
}
