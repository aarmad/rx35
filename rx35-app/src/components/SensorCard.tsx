import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/ThemeContext";
import { typography, spacing, radius } from "@/theme/tokens";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "danger" | "accent";
}

export function SensorCard({ icon, label, value, sub, tone = "default" }: Props) {
  const { colors } = useAppTheme();

  const toneColor =
    tone === "success" ? colors.success : tone === "danger" ? colors.danger : tone === "accent" ? colors.accent : colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: toneColor + "22" }]}>
        <Ionicons name={icon} size={18} color={toneColor} />
      </View>
      <Text style={[styles.value, { color: colors.text, fontFamily: typography.display }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.body }]}>{label}</Text>
      {sub ? <Text style={[styles.sub, { color: colors.textMuted, fontFamily: typography.body }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "47%",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: 22,
    marginBottom: 2,
  },
  label: {
    fontSize: 13,
  },
  sub: {
    fontSize: 11,
    marginTop: 2,
  },
});
