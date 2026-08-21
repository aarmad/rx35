import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/ScreenHeader";
import { useAppTheme } from "@/theme/ThemeContext";
import { useParcel } from "@/parcels/ParcelContext";
import { typography, spacing, radius } from "@/theme/tokens";
import { getAlerts, markAlertRead } from "@/services/api";
import { AlertItem } from "@/services/types";

const FILTERS: { key: AlertItem["type"] | "tous"; label: string }[] = [
  { key: "tous", label: "Toutes" },
  { key: "presence_humaine", label: "Présence" },
  { key: "passage_animal", label: "Animaux" },
  { key: "mouvement", label: "Mouvement" },
  { key: "niveau_eau", label: "Niveau d'eau" },
  { key: "alarme", label: "Alarme" },
  { key: "badge_refuse", label: "Badges" },
];

const ICONS: Record<AlertItem["type"], keyof typeof Ionicons.glyphMap> = {
  mouvement: "walk-outline",
  presence_humaine: "body-outline",
  passage_animal: "paw-outline",
  niveau_eau: "water-outline",
  alarme: "alert-circle-outline",
  badge_refuse: "card-outline",
  info: "information-circle-outline",
};

function timeAgo(ts: number) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  return `il y a ${Math.round(diff / 86400)} j`;
}

export default function AlertsScreen() {
  const { colors } = useAppTheme();
  const { current: parcel } = useParcel();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<AlertItem["type"] | "tous">("tous");

  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setAlerts(await getAlerts(parcel!.id));
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Alertes indisponibles.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = filter === "tous" ? alerts : alerts.filter((a) => a.type === filter);
  const unreadCount = alerts.filter((a) => !a.lu).length;

  return (
    <Screen showTopBar={false}>
      <ScreenHeader
        eyebrow={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est lu"}
        title="Alertes"
        subtitle="Historique des événements de sécurité et du système"
      />

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[
              styles.filterChip,
              { backgroundColor: filter === f.key ? colors.primary : colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={{ color: filter === f.key ? "#fff" : colors.text, fontFamily: typography.bodyMedium, fontSize: 12 }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <EmptyState icon="cloud-offline-outline" title="Alertes indisponibles" message={error} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="Aucune alerte" message="Rien à signaler pour ce filtre." />
      ) : (
        <FlatList
          data={filtered}
          scrollEnabled={false}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={async () => {
                try {
                  await markAlertRead(parcel!.id, item.id);
                } catch {
                  // Marquage non enregistré côté serveur : le rechargement
                  // ci-dessous laissera l'alerte non lue, ce qui est l'état réel.
                }
                load();
              }}
              style={[
                styles.alertRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
                !item.lu && { borderLeftColor: colors.accent, borderLeftWidth: 3 },
              ]}
            >
              <Ionicons name={ICONS[item.type]} size={20} color={item.lu ? colors.textMuted : colors.accent} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={{ color: colors.text, fontFamily: item.lu ? typography.body : typography.bodyMedium, fontSize: 13 }}>
                  {item.message}
                </Text>
                <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 2 }}>
                  {timeAgo(item.timestamp)}
                </Text>
              </View>
              {!item.lu ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: spacing.sm },
});
