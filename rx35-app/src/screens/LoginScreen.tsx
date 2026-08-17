import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "@/auth/AuthContext";
import { useAppTheme } from "@/theme/ThemeContext";
import { typography, spacing, radius } from "@/theme/tokens";

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const { login } = useAuth();
  const navigation = useNavigation<any>();
  const [telephone, setTelephone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!telephone.trim() || !password) {
      setError("Renseignez votre numéro et votre mot de passe.");
      return;
    }
    setLoading(true);
    try {
      await login(telephone.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.content}>
          <Text style={{ color: colors.accent, fontFamily: typography.bodySemiBold, fontSize: 12, textTransform: "uppercase" }}>
            RX Stack
          </Text>
          <Text style={{ color: colors.text, fontFamily: typography.display, fontSize: 30, marginTop: 4, marginBottom: spacing.xl }}>
            Connexion
          </Text>

          <Text style={[styles.label, { color: colors.textMuted }]}>Numéro de téléphone</Text>
          <TextInput
            value={telephone}
            onChangeText={setTelephone}
            placeholder="+228 90 00 00 00"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <Text style={[styles.label, { color: colors.textMuted }]}>Mot de passe</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          {error ? <Text style={{ color: colors.danger, fontFamily: typography.body, fontSize: 13, marginBottom: spacing.sm }}>{error}</Text> : null}

          <Pressable onPress={submit} disabled={loading} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Se connecter</Text>}
          </Pressable>

          <Pressable onPress={() => navigation.navigate("Register")} style={{ marginTop: spacing.lg, alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 13 }}>
              Pas encore de compte ? <Text style={{ color: colors.accent, fontFamily: typography.bodySemiBold }}>Créer un compte</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  label: { fontFamily: typography.body, fontSize: 12, marginBottom: 6, marginTop: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, marginBottom: spacing.xs },
  primaryButton: { borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.lg },
  primaryButtonText: { color: "#fff", fontFamily: typography.bodySemiBold, fontSize: 15 },
});
