import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/ThemeContext";
import { useAuth } from "@/auth/AuthContext";
import { typography, spacing, radius } from "@/theme/tokens";
import { demanderCodeReinitialisation, envoiEmailDisponible } from "@/services/api";

// Deux étapes sur un seul écran : demander le code, puis le saisir avec le
// nouveau mot de passe. Éviter une navigation supplémentaire garde le
// numéro sous les yeux de l'agriculteur, qui vient justement de perdre ses
// repères.
type Etape = "demande" | "code";

export default function ForgotPasswordScreen() {
  const { colors } = useAppTheme();
  const { resetPassword } = useAuth();
  const navigation = useNavigation<any>();

  const [etape, setEtape] = useState<Etape>("demande");
  const [telephone, setTelephone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // null = on ne sait pas encore. Tant que le serveur n'a pas de SMTP, aucun
  // code ne peut partir : il faut le dire tout de suite plutôt que de
  // laisser l'agriculteur guetter sa boîte mail.
  const [emailPossible, setEmailPossible] = useState<boolean | null>(null);

  useEffect(() => {
    envoiEmailDisponible()
      .then(setEmailPossible)
      .catch(() => setEmailPossible(null)); // serveur injoignable : on n'affirme rien
  }, []);

  const demander = async () => {
    setError(null);
    if (!telephone.trim()) {
      setError("Renseignez votre numéro de téléphone.");
      return;
    }
    setLoading(true);
    try {
      setInfo(await demanderCodeReinitialisation(telephone.trim()));
      setEtape("code");
    } catch (err: any) {
      setError(err?.message ?? "Demande impossible.");
    } finally {
      setLoading(false);
    }
  };

  const reinitialiser = async () => {
    setError(null);
    if (code.trim().length !== 6) {
      setError("Le code comporte 6 chiffres.");
      return;
    }
    if (password.length < 6) {
      setError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setLoading(true);
    try {
      // Réussite = connexion immédiate : RootNavigator bascule tout seul
      // vers l'application, aucun écran à fermer ici.
      await resetPassword(telephone.trim(), code.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? "Réinitialisation impossible.");
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
          <Text style={{ color: colors.text, fontFamily: typography.display, fontSize: 28, marginTop: 4, marginBottom: spacing.lg }}>
            Mot de passe oublié
          </Text>

          {etape === "demande" ? (
            <>
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 13, marginBottom: spacing.lg }}>
                Saisissez votre numéro. Si votre compte a une adresse e-mail enregistrée, un code de vérification y sera envoyé.
              </Text>

              {emailPossible === false ? (
                <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                  <Ionicons name="warning-outline" size={16} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontFamily: typography.body, fontSize: 12, marginLeft: 6, flex: 1 }}>
                    L'envoi d'e-mails n'est pas configuré sur ce serveur : aucun code ne partira. Contactez RX Stack
                    pour réinitialiser votre mot de passe.
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.label, { color: colors.textMuted }]}>Numéro de téléphone</Text>
              <TextInput
                value={telephone}
                onChangeText={setTelephone}
                placeholder="90 00 00 00"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
            </>
          ) : (
            <>
              {info ? (
                <View style={[styles.infoCard, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                  <Ionicons name="mail-outline" size={16} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontFamily: typography.body, fontSize: 12, marginLeft: 6, flex: 1 }}>
                    {info}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.label, { color: colors.textMuted }]}>Code reçu (6 chiffres)</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, letterSpacing: 4 }]}
              />
              <Text style={[styles.label, { color: colors.textMuted }]}>Nouveau mot de passe</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="6 caractères minimum"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
            </>
          )}

          {error ? (
            <Text style={{ color: colors.danger, fontFamily: typography.body, fontSize: 13, marginBottom: spacing.sm }}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={etape === "demande" ? demander : reinitialiser}
            // Inutile de demander un code que le serveur ne peut pas envoyer.
            disabled={loading || (etape === "demande" && emailPossible === false)}
            style={[
              styles.primaryButton,
              {
                backgroundColor: colors.primary,
                opacity: loading || (etape === "demande" && emailPossible === false) ? 0.4 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {etape === "demande" ? "Recevoir un code" : "Choisir ce mot de passe"}
              </Text>
            )}
          </Pressable>

          {etape === "code" ? (
            <Pressable onPress={() => setEtape("demande")} style={{ marginTop: spacing.md, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 13 }}>Renvoyer un code</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing.lg, alignItems: "center" }}>
            <Text style={{ color: colors.accent, fontFamily: typography.bodySemiBold, fontSize: 13 }}>
              Retour à la connexion
            </Text>
          </Pressable>

          <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: spacing.xl, lineHeight: 16 }}>
            Aucune adresse e-mail sur votre compte ? Ajoutez-en une dans Réglages dès que vous êtes connecté : sans elle, aucune
            récupération n'est possible.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  label: { fontFamily: typography.body, fontSize: 12, marginBottom: 6, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  primaryButton: { borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.lg },
  primaryButtonText: { color: "#fff", fontFamily: typography.bodySemiBold, fontSize: 15 },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
});
