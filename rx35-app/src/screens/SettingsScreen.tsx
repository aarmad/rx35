import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppTheme, ThemePreference } from "@/theme/ThemeContext";
import { useAuth } from "@/auth/AuthContext";
import { typography, spacing, radius } from "@/theme/tokens";
import { getParcelInfo, saveParcelInfo } from "@/services/api";
import { API_BASE_URL } from "@/services/config";
import { Culture, ParcelInfo } from "@/services/types";

const CULTURES: Culture[] = ["tomate", "mais", "riz", "piment", "oignon"];
const THEME_OPTIONS: { key: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "light", label: "Clair", icon: "sunny-outline" },
  { key: "dark", label: "Sombre", icon: "moon-outline" },
  { key: "auto", label: "Automatique", icon: "phone-portrait-outline" },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useAppTheme();
  const { user, updateProfile, logout } = useAuth();
  const [parcel, setParcel] = useState<ParcelInfo | null>(null);
  const [nom, setNom] = useState("");
  const [compteNom, setCompteNom] = useState(user?.nom ?? "");
  const [compteTelephone, setCompteTelephone] = useState(user?.telephone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getParcelInfo()
      .then((p) => {
        setParcel(p);
        setNom(p.nom);
        setError(null);
      })
      .catch((err) => setError(err?.message ?? "Configuration de la parcelle indisponible."));
  }, []);

  const updateCulture = async (culture: Culture) => {
    if (!parcel) return;
    const updated = await saveParcelInfo({ culture });
    setParcel(updated);
  };

  const saveNom = async () => {
    if (!parcel) return;
    setSaving(true);
    const updated = await saveParcelInfo({ nom });
    setParcel(updated);
    setSaving(false);
  };

  const saveCompte = async () => {
    if (!compteNom.trim() || !compteTelephone.trim()) return;
    await updateProfile({ nom: compteNom.trim(), telephone: compteTelephone.trim() });
  };

  // Sans parcelle chargée, on garde tout de même l'écran accessible : c'est
  // ici que l'utilisateur voit l'adresse du serveur et peut se déconnecter,
  // les deux choses utiles justement quand la connexion ne marche pas.
  if (!parcel && !error) return <Screen showTopBar={false}><></></Screen>;

  return (
    <Screen showTopBar={false}>
      <ScreenHeader eyebrow="Configuration" title="Réglages" subtitle="Compte, parcelle et apparence de l'application" />

      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Compte</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body }]}>Nom</Text>
        <TextInput
          value={compteNom}
          onChangeText={setCompteNom}
          onBlur={saveCompte}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, marginBottom: spacing.sm }]}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body }]}>Téléphone</Text>
        <TextInput
          value={compteTelephone}
          onChangeText={setCompteTelephone}
          onBlur={saveCompte}
          keyboardType="phone-pad"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholderTextColor={colors.textMuted}
        />
        <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: colors.danger }]}>
          <Ionicons name="log-out-outline" size={16} color={colors.danger} />
          <Text style={{ color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 13, marginLeft: 6 }}>
            Se déconnecter
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Parcelle</Text>
      {!parcel ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
          <Text style={{ color: colors.danger, fontFamily: typography.body, fontSize: 13 }}>{error}</Text>
        </View>
      ) : (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body }]}>Nom de la parcelle</Text>
        <View style={styles.nomRow}>
          <TextInput
            value={nom}
            onChangeText={setNom}
            onBlur={saveNom}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            placeholder="Ex. Parcelle 1 — Lomé Nord"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body, marginTop: spacing.md }]}>
          Culture
        </Text>
        <View style={styles.chipRow}>
          {CULTURES.map((c) => (
            <Pressable
              key={c}
              onPress={() => updateCulture(c)}
              style={[
                styles.chip,
                { backgroundColor: parcel.culture === c ? colors.primary : colors.background, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: parcel.culture === c ? "#fff" : colors.text, fontFamily: typography.bodyMedium, fontSize: 12 }}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body, marginTop: spacing.md }]}>
          Date de plantation
        </Text>
        <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>{parcel.datePlantation}</Text>

        <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body, marginTop: spacing.md }]}>
          Coordonnées GPS du boîtier
        </Text>
        <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>
          {parcel.latitude.toFixed(4)}, {parcel.longitude.toFixed(4)}
        </Text>
      </View>
      )}

      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Apparence</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.chipRow}>
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setPreference(opt.key)}
              style={[
                styles.themeChip,
                { backgroundColor: preference === opt.key ? colors.accentSoft : colors.background, borderColor: colors.border },
              ]}
            >
              <Ionicons name={opt.icon} size={16} color={preference === opt.key ? colors.accent : colors.textMuted} />
              <Text
                style={{
                  color: preference === opt.key ? colors.accent : colors.text,
                  fontFamily: typography.bodyMedium,
                  fontSize: 12,
                  marginLeft: 6,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>À propos</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>RX35 — RX Stack</Text>
        <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 2 }}>
          Application v0.1
        </Text>
        {/* Adresse réellement utilisée par l'application : c'est la première
            chose à vérifier quand rien ne se charge sur le téléphone. */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body, marginTop: spacing.md }]}>
          Serveur
        </Text>
        <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 13 }}>{API_BASE_URL}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 14, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.lg },
  fieldLabel: { fontSize: 12, marginBottom: 6 },
  nomRow: { flexDirection: "row" },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, marginRight: spacing.sm, marginBottom: spacing.sm },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 10,
    marginTop: spacing.md,
  },
});
