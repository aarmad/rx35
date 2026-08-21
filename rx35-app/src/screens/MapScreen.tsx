import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppTheme } from "@/theme/ThemeContext";
import { useParcel } from "@/parcels/ParcelContext";
import { typography, spacing, radius, palette } from "@/theme/tokens";
import { getAvailableNdviDates, getNdviSnapshot } from "@/services/api";
import { avecCache } from "@/services/cache";
import { NdviSnapshot } from "@/services/types";

const ZONE_COLORS: Record<number, string> = {
  1: palette.ndvi1,
  2: palette.ndvi2,
  3: palette.ndvi3,
  4: palette.ndvi4,
  5: palette.ndvi5,
};

const ZONE_LABELS: Record<number, string> = {
  1: "Zone 1 — Très bonne vigueur",
  2: "Zone 2 — Bonne vigueur",
  3: "Zone 3 — Vigueur moyenne",
  4: "Zone 4 — Stress modéré",
  5: "Zone 5 — Stress marqué",
};

export default function MapScreen() {
  const { colors } = useAppTheme();
  const { current: parcel } = useParcel();
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [snapshot, setSnapshot] = useState<NdviSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horsConnexion, setHorsConnexion] = useState(false);
  // Largeur réelle de la carte, mesurée à l'affichage. Les cellules étaient
  // dimensionnées en pourcentage + aspectRatio : sur plusieurs téléphones
  // Android la hauteur restait à zéro et la grille apparaissait vide. On
  // calcule donc des pixels, ce qui ne dépend d'aucune subtilité de moteur
  // de mise en page.
  const [largeurGrille, setLargeurGrille] = useState(0);

  // Nombre de colonnes déduit des données plutôt que codé en dur : le
  // backend peut renvoyer une grille d'une autre taille.
  const colonnes = snapshot?.grid?.length
    ? Math.max(...snapshot.grid.map((c) => c.col)) + 1
    : 8;
  const cote = largeurGrille > 0 ? largeurGrille / colonnes : 0;

  useEffect(() => {
    (async () => {
      try {
        const d = (await avecCache(`${parcel!.id}:ndvi-dates`, () => getAvailableNdviDates(parcel!.id))).data;
        setDates(d);
        setSelectedDate(d[0]);
      } catch (err: any) {
        setError(err?.message ?? "Carte satellite indisponible.");
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    avecCache(`${parcel!.id}:ndvi:${selectedDate}`, () => getNdviSnapshot(parcel!.id, selectedDate))
      .then((r) => {
        setSnapshot(r.data);
        setHorsConnexion(r.horsConnexion);
        setError(null);
      })
      .catch((err) => setError(err?.message ?? "Carte satellite indisponible."))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Imagerie Sentinel-2"
        title="Carte satellite"
        subtitle="Indice de végétation (NDVI) calculé sur les coordonnées GPS du boîtier"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
        {dates.map((d) => {
          const active = d === selectedDate;
          return (
            <Pressable
              key={d}
              onPress={() => setSelectedDate(d)}
              style={[
                styles.dateChip,
                { backgroundColor: active ? colors.primary : colors.surface, borderColor: colors.border },
              ]}
            >
              <Text
                style={{
                  color: active ? "#fff" : colors.text,
                  fontFamily: typography.bodyMedium,
                  fontSize: 12,
                }}
              >
                {d}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.mapCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {error ? (
          <Text
            style={{
              color: colors.danger,
              fontFamily: typography.body,
              fontSize: 13,
              textAlign: "center",
              paddingVertical: spacing.xl,
            }}
          >
            {error}
          </Text>
        ) : loading || !snapshot ? (
          <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.xxl }} />
        ) : (
          <View style={styles.grid} onLayout={(e) => setLargeurGrille(e.nativeEvent.layout.width)}>
            {cote > 0
              ? snapshot.grid.map((cell) => (
                  <View
                    key={`${cell.row}-${cell.col}`}
                    style={{
                      width: cote,
                      height: cote,
                      // Une zone inconnue ne doit pas produire une case
                      // invisible : on la rend visiblement neutre.
                      backgroundColor: ZONE_COLORS[cell.zone] ?? colors.border,
                    }}
                  />
                ))
              : null}
          </View>
        )}
      </View>

      <Text style={[styles.noteText, { color: colors.textMuted, fontFamily: typography.body }]}>
        {horsConnexion
          ? "Hors connexion : dernière carte satellite téléchargée pour cette date."
          : !snapshot || error
          ? "La grille NDVI est calculée par le backend à partir des images Sentinel-2 (Copernicus) sur les coordonnées GPS du boîtier."
          : snapshot.source === "sentinel-hub"
          ? "Grille NDVI calculée à partir d'une image Sentinel-2 (Copernicus) sur les coordonnées GPS du boîtier."
          : "Données simulées : le backend n'a pas pu obtenir d'image Sentinel-2 pour cette date (identifiants Copernicus absents, ou scène trop nuageuse). Voir SENTINEL_HUB_CLIENT_ID dans le .env du backend."}
      </Text>

      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Légende</Text>
      <View style={[styles.legendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {[1, 2, 3, 4, 5].map((z) => (
          <View key={z} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: ZONE_COLORS[z] }]} />
            <Text style={{ color: colors.text, fontFamily: typography.body, fontSize: 13 }}>{ZONE_LABELS[z]}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  mapCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", width: "100%" },
  noteText: { fontSize: 12, marginBottom: spacing.lg, lineHeight: 17 },
  sectionLabel: { fontSize: 14, marginBottom: spacing.sm },
  legendCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 3, marginRight: 10 },
});
