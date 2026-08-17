import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/ThemeContext";
import { typography, spacing } from "@/theme/tokens";

export function ScreenHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: colors.accent, fontFamily: typography.bodySemiBold }]}>{eyebrow}</Text>
      ) : null}
      <Text style={[styles.title, { color: colors.text, fontFamily: typography.display }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: typography.body }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon, title, message }: { icon: keyof typeof Ionicons.glyphMap; title: string; message: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name={icon} size={30} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.bodySemiBold }]}>{title}</Text>
      <Text style={[styles.emptyMessage, { color: colors.textMuted, fontFamily: typography.body }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    marginTop: spacing.sm,
  },
  emptyMessage: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
});
