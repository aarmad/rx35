// ============================================================
// RX35 — Système de design
//
// Identité visuelle : agritech africaine, terrain et lumière plutôt que
// dashboard générique. Palette inspirée du sol, du feuillage et du
// crépuscule (le lampadaire crépusculaire étant l'un des signaux forts
// du produit). Fraunces (serif chaleureuse et organique) pour les titres
// et les grands chiffres, Work Sans pour les données et l'interface —
// volontairement pas Inter partout, pour ne pas retomber dans le
// dashboard SaaS générique.
// ============================================================

export const palette = {
  // Verts — feuillage, croissance, état "sain"
  forestDeep: "#1F3B2C",
  leafBright: "#5B9A4C",
  leafSoft: "#DCEBD6",

  // Terre / accent chaud — usage CTA, badges, accents
  ochre: "#C97A2E",
  ochreSoft: "#F3E1CC",

  // Alerte / alarme
  terracotta: "#B23A2E",
  terracottaSoft: "#F6DEDA",

  // Neutres
  sand: "#F6F1E4",
  sandDeep: "#EFE7D3",
  night: "#16201A",
  nightSoft: "#20301F",
  ink: "#1B2A1F",
  inkSoft: "#4B5A4F",
  white: "#FFFFFF",

  // NDVI (carte satellite) — du sain (vert) au stressé (rouge)
  ndvi1: "#3E7A3B", // zone 1 : très bonne vigueur
  ndvi2: "#8CB84A",
  ndvi3: "#E4C13A",
  ndvi4: "#E08B36",
  ndvi5: "#C8482E", // zone 5 : stress marqué
};

export const theme = {
  light: {
    background: palette.sand,
    surface: palette.white,
    surfaceAlt: palette.sandDeep,
    text: palette.ink,
    textMuted: palette.inkSoft,
    primary: palette.forestDeep,
    accent: palette.ochre,
    accentSoft: palette.ochreSoft,
    success: palette.leafBright,
    successSoft: palette.leafSoft,
    danger: palette.terracotta,
    dangerSoft: palette.terracottaSoft,
    border: "#E3DAC5",
  },
  dark: {
    background: palette.night,
    surface: palette.nightSoft,
    surfaceAlt: "#25342A",
    text: palette.sand,
    textMuted: "#B7C4B2",
    primary: palette.leafBright,
    accent: palette.ochre,
    accentSoft: "#3A2E1E",
    success: palette.leafBright,
    successSoft: "#2A3E27",
    danger: "#E0665A",
    dangerSoft: "#3E2624",
    border: "#33452F",
  },
};

export type ThemeColors = typeof theme.light;

export const typography = {
  display: "Fraunces_600SemiBold",
  displayItalic: "Fraunces_500Medium_Italic",
  body: "WorkSans_400Regular",
  bodyMedium: "WorkSans_500Medium",
  bodySemiBold: "WorkSans_600SemiBold",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};
