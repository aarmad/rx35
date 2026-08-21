import React, { useEffect, useState } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/ThemeContext";
import { spacing, radius } from "@/theme/tokens";
import { getUnreadAlertCount } from "@/services/api";
import { useParcel } from "@/parcels/ParcelContext";

// Barre persistante en haut de chaque onglet principal : accès rapide aux
// Alertes (avec badge) et à Réglages/Compte, pour ne pas les enterrer dans
// la barre du bas (retour utilisateur : ces deux écrans doivent rester
// atteignables en un geste depuis n'importe quel onglet).
export function TopBar() {
  const { colors, isDark, toggleTheme } = useAppTheme();
  const navigation = useNavigation<any>();
  const { current: parcel } = useParcel();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!parcel) return;
    // Sondage discret : une panne réseau ne doit pas remonter d'erreur ici,
    // le badge garde simplement sa dernière valeur connue.
    const load = () => getUnreadAlertCount(parcel.id).then(setUnread).catch(() => {});
    load();
    const unsub = navigation.addListener?.("focus", load);
    const interval = setInterval(load, 15000);
    return () => {
      clearInterval(interval);
      if (typeof unsub === "function") unsub();
    };
  }, [navigation, parcel]);

  return (
    <View style={styles.row}>
      <View style={[styles.brand]}>
        <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13, letterSpacing: 1 }}>RX35</Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        {/* Bascule jour/nuit en un geste : en plein soleil comme de nuit,
            l'agriculteur doit pouvoir corriger la lisibilité sans aller
            fouiller dans les Réglages. */}
        <Pressable
          onPress={toggleTheme}
          style={[
            styles.iconButton,
            { backgroundColor: colors.surface, borderColor: colors.border, marginRight: spacing.sm },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isDark ? "Passer au thème clair" : "Passer au thème sombre"}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={18} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Alertes")}
          style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Alertes"
        >
          <Ionicons name="notifications-outline" size={18} color={colors.text} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Reglages")}
          style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border, marginLeft: spacing.sm }]}
          accessibilityLabel="Réglages et compte"
        >
          <Ionicons name="person-circle-outline" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
