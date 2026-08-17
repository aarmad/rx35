import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Alert, ActivityIndicator, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppTheme, ThemePreference } from "@/theme/ThemeContext";
import { useAuth } from "@/auth/AuthContext";
import { useParcel } from "@/parcels/ParcelContext";
import { typography, spacing, radius } from "@/theme/tokens";
import {
  saveParcelInfo,
  createParcel,
  listMembers,
  addMember,
  removeMember,
  listDevices,
  createDevice,
  deleteDevice,
} from "@/services/api";
import { API_BASE_URL } from "@/services/config";
import { Culture, DeviceInfo, ParcelMember, Role } from "@/services/types";

const CULTURES: Culture[] = ["tomate", "mais", "riz", "piment", "oignon"];
const THEME_OPTIONS: { key: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "light", label: "Clair", icon: "sunny-outline" },
  { key: "dark", label: "Sombre", icon: "moon-outline" },
  { key: "auto", label: "Automatique", icon: "phone-portrait-outline" },
];
const ROLE_LABEL: Record<Role, string> = {
  proprietaire: "Propriétaire",
  membre: "Membre",
  observateur: "Observateur",
};

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useAppTheme();
  const { user, updateProfile, logout } = useAuth();
  const { parcels, current, select, refresh } = useParcel();

  const [nom, setNom] = useState("");
  const [compteNom, setCompteNom] = useState(user?.nom ?? "");
  const [compteTelephone, setCompteTelephone] = useState(user?.telephone ?? "");
  const [members, setMembers] = useState<ParcelMember[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [invitePhone, setInvitePhone] = useState("");
  const [busy, setBusy] = useState(false);

  const estProprietaire = current?.role === "proprietaire";

  useEffect(() => setNom(current?.nom ?? ""), [current?.id, current?.nom]);

  const chargerDetails = useCallback(async () => {
    if (!current) return;
    try {
      const [m, d] = await Promise.all([listMembers(current.id), listDevices(current.id)]);
      setMembers(m);
      setDevices(d);
    } catch {
      // Détails secondaires : leur absence ne doit pas bloquer l'écran.
    }
  }, [current?.id]);

  useEffect(() => {
    chargerDetails();
  }, [chargerDetails]);

  const enregistrerNom = async () => {
    if (!current || !nom.trim() || nom === current.nom) return;
    try {
      await saveParcelInfo(current.id, { nom: nom.trim() });
      await refresh();
    } catch (e: any) {
      Alert.alert("Enregistrement impossible", e?.message ?? "");
    }
  };

  const changerCulture = async (culture: Culture) => {
    if (!current) return;
    try {
      await saveParcelInfo(current.id, { culture });
      await refresh();
    } catch (e: any) {
      Alert.alert("Enregistrement impossible", e?.message ?? "");
    }
  };

  const nouvelleParcelle = async () => {
    setBusy(true);
    try {
      const p = await createParcel({ nom: `Parcelle ${parcels.length + 1}` });
      await refresh();
      select(p.id);
    } catch (e: any) {
      Alert.alert("Création impossible", e?.message ?? "");
    } finally {
      setBusy(false);
    }
  };

  const inviter = async () => {
    if (!current || !invitePhone.trim()) return;
    setBusy(true);
    try {
      setMembers(await addMember(current.id, invitePhone.trim(), "membre"));
      setInvitePhone("");
    } catch (e: any) {
      Alert.alert("Invitation impossible", e?.message ?? "");
    } finally {
      setBusy(false);
    }
  };

  const retirer = (m: ParcelMember) => {
    if (!current) return;
    Alert.alert("Retirer ce membre ?", `${m.nom} n'aura plus accès à cette parcelle.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          try {
            setMembers(await removeMember(current.id, m.id));
          } catch (e: any) {
            Alert.alert("Retrait impossible", e?.message ?? "");
          }
        },
      },
    ]);
  };

  // La clé n'est lisible qu'à la création : on la met immédiatement à
  // disposition, sinon il faut supprimer le boîtier et en recréer un.
  const ajouterBoitier = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const d = await createDevice(current.id, `Boîtier ${devices.length + 1}`);
      setDevices(await listDevices(current.id));
      Alert.alert(
        "Clé du boîtier",
        `À recopier maintenant dans la configuration du firmware — elle ne sera plus affichée :\n\n${d.key}`,
        [
          { text: "Fermer", style: "cancel" },
          { text: "Partager", onPress: () => Share.share({ message: d.key }) },
        ]
      );
    } catch (e: any) {
      Alert.alert("Création impossible", e?.message ?? "");
    } finally {
      setBusy(false);
    }
  };

  const supprimerBoitier = (d: DeviceInfo) => {
    if (!current) return;
    Alert.alert("Supprimer ce boîtier ?", `${d.nom} ne pourra plus envoyer de relevés.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDevice(current.id, d.id);
            setDevices(await listDevices(current.id));
          } catch (e: any) {
            Alert.alert("Suppression impossible", e?.message ?? "");
          }
        },
      },
    ]);
  };

  const saveCompte = async () => {
    if (!compteNom.trim() || !compteTelephone.trim()) return;
    try {
      await updateProfile({ nom: compteNom.trim(), telephone: compteTelephone.trim() });
    } catch (e: any) {
      Alert.alert("Enregistrement impossible", e?.message ?? "");
    }
  };

  return (
    <Screen showTopBar={false}>
      <ScreenHeader eyebrow="Configuration" title="Réglages" subtitle="Parcelles, boîtiers, équipe et apparence" />

      {/* --- Parcelles --- */}
      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>
        Mes parcelles
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {parcels.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => select(p.id)}
            style={[
              styles.parcelRow,
              { borderColor: p.id === current?.id ? colors.primary : colors.border },
              p.id === current?.id && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <Ionicons
              name={p.id === current?.id ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={p.id === current?.id ? colors.primary : colors.textMuted}
            />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>{p.nom}</Text>
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }}>
                {p.culture} · {ROLE_LABEL[p.role]}
              </Text>
            </View>
          </Pressable>
        ))}
        <Pressable onPress={nouvelleParcelle} disabled={busy} style={[styles.addRow, { borderColor: colors.border }]}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: typography.bodyMedium, fontSize: 13, marginLeft: 6 }}>
            Ajouter une parcelle
          </Text>
        </Pressable>
      </View>

      {current ? (
        <>
          {/* --- Parcelle courante --- */}
          <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>
            {current.nom}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body }]}>Nom</Text>
            <TextInput
              value={nom}
              onChangeText={setNom}
              onBlur={enregistrerNom}
              editable={current.role !== "observateur"}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body, marginTop: spacing.md }]}>
              Culture
            </Text>
            <View style={styles.chipRow}>
              {CULTURES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => current.role !== "observateur" && changerCulture(c)}
                  style={[
                    styles.chip,
                    { backgroundColor: current.culture === c ? colors.primary : colors.background, borderColor: colors.border },
                  ]}
                >
                  <Text style={{ color: current.culture === c ? "#fff" : colors.text, fontFamily: typography.bodyMedium, fontSize: 12 }}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body, marginTop: spacing.md }]}>
              Date de plantation
            </Text>
            <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>
              {current.datePlantation}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body, marginTop: spacing.md }]}>
              Coordonnées GPS
            </Text>
            <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>
              {current.latitude.toFixed(4)}, {current.longitude.toFixed(4)}
            </Text>
          </View>

          {/* --- Boîtiers --- */}
          <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Boîtiers</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {devices.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 13 }}>
                Aucun boîtier. Ajoutez-en un pour obtenir la clé à recopier dans le firmware.
              </Text>
            ) : (
              devices.map((d) => (
                <View key={d.id} style={styles.memberRow}>
                  <Ionicons name="hardware-chip-outline" size={18} color={colors.textMuted} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>{d.nom}</Text>
                    <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }}>
                      {d.lastSeenAt
                        ? `Vu ${new Date(d.lastSeenAt * 1000).toLocaleString("fr-FR")}`
                        : "Jamais connecté"}
                    </Text>
                  </View>
                  {estProprietaire ? (
                    <Pressable onPress={() => supprimerBoitier(d)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
            {estProprietaire ? (
              <Pressable onPress={ajouterBoitier} disabled={busy} style={[styles.addRow, { borderColor: colors.border }]}>
                {busy ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontFamily: typography.bodyMedium, fontSize: 13, marginLeft: 6 }}>
                      Ajouter un boîtier
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          {/* --- Équipe --- */}
          <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>
            Personnes ayant accès
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <Ionicons name="person-circle-outline" size={20} color={colors.textMuted} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 }}>{m.nom}</Text>
                  <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }}>
                    {m.telephone} · {ROLE_LABEL[m.role]}
                  </Text>
                </View>
                {estProprietaire && m.id !== user?.id ? (
                  <Pressable onPress={() => retirer(m)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {estProprietaire ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: typography.body }]}>
                  Inviter par numéro (la personne doit déjà avoir un compte RX35)
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    value={invitePhone}
                    onChangeText={setInvitePhone}
                    placeholder="90 00 00 00"
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                  <Pressable onPress={inviter} disabled={busy} style={[styles.inviteBtn, { backgroundColor: colors.primary }]}>
                    <Ionicons name="person-add-outline" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {/* --- Compte --- */}
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

      {/* --- Apparence --- */}
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
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
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
  parcelRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    paddingVertical: 10,
    marginTop: spacing.xs,
  },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs },
  inviteBtn: {
    width: 40,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
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
