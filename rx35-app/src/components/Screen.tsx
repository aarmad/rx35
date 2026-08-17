import React from "react";
import { ScrollView, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/theme/ThemeContext";
import { spacing } from "@/theme/tokens";
import { TopBar } from "@/components/TopBar";

interface Props {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  showTopBar?: boolean;
}

export function Screen({ children, onRefresh, refreshing, showTopBar = true }: Props) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      {showTopBar ? <TopBar /> : null}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
