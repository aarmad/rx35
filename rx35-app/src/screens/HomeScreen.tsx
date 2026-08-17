import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SensorCard } from "@/components/SensorCard";
import { RadialGauge } from "@/components/RadialGauge";
import { useAppTheme } from "@/theme/ThemeContext";
import { typography, spacing, radius } from "@/theme/tokens";
import {
  getLatestSensorSnapshot,
  getIrrigationState,
  setIrrigationMode,
  setPumpManual,
  getGrowthStage,
  getWeather,
} from "@/services/api";
import { getLatestSensorSnapshot as getMockSensorSnapshot } from "@/services/mockApi";
import { useParcel } from "@/parcels/ParcelContext";
import { SensorSnapshot, WeatherDay } from "@/services/types";

// Seuils indicatifs pour l'affichage (répliqués du firmware, à terme fournis
// par le backend une fois la synchronisation en place — voir irrigation.cpp).
const SEUIL_HUMIDITE_PAR_DEFAUT = 55;

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const { current: parcel, canControl } = useParcel();
  const [snapshot, setSnapshot] = useState<SensorSnapshot | null>(null);
  const [stade, setStade] = useState<string>("");
  const [mode, setMode] = useState<"auto" | "manuel">("auto");
  const [pumpOn, setPumpOn] = useState(false);
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [demoSensors, setDemoSensors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!parcel) return;
    try {
      // La météo dépend d'un service externe (Open-Meteo) : son indisponibilité
      // ne doit pas empêcher l'affichage des données de la parcelle.
      const [irrigation, w] = await Promise.all([
        getIrrigationState(parcel.id),
        getWeather(parcel.id).catch(() => [] as WeatherDay[]),
      ]);
      setMode(irrigation.mode);
      setPumpOn(irrigation.pumpManualOn);
      setWeather(w);
      const st = await getGrowthStage(parcel.culture, parcel.datePlantation);
      setStade(st);

      // Le boîtier n'a peut-être encore jamais envoyé de relevé (pas encore
      // acheté/câblé, ou pas encore connecté au Wi-Fi) : plutôt que de rester
      // bloqué en chargement, on bascule sur des valeurs de démonstration
      // pour pouvoir travailler l'interface en attendant.
      try {
        const s = await getLatestSensorSnapshot(parcel.id);
        setSnapshot(s);
        setDemoSensors(false);
      } catch {
        const s = await getMockSensorSnapshot();
        setSnapshot(s);
        setDemoSensors(true);
      }
      setError(null);
    } catch (err: any) {
      // Backend injoignable ou en erreur : on l'affiche au lieu de laisser
      // l'écran tourner indéfiniment sur son indicateur de chargement.
      setError(err?.message ?? "Chargement impossible.");
    }
  }, [parcel]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Les deux bascules affichent l'état visé immédiatement, puis reviennent en
  // arrière si le backend refuse : afficher "MANUEL" alors que le boîtier est
  // resté en automatique serait trompeur sur une commande de pompe.
  const toggleMode = async () => {
    const previous = mode;
    const next = mode === "auto" ? "manuel" : "auto";
    setMode(next);
    try {
      await setIrrigationMode(parcel!.id, next);
      setError(null);
    } catch (err: any) {
      setMode(previous);
      setError(err?.message ?? "Changement de mode impossible.");
    }
  };

  const togglePump = async () => {
    const previous = pumpOn;
    const next = !pumpOn;
    setPumpOn(next);
    try {
      const confirmed = await setPumpManual(parcel!.id, next);
      setPumpOn(confirmed);
      setError(null);
    } catch (err: any) {
      setPumpOn(previous);
      setError(err?.message ?? "Commande de la pompe impossible.");
    }
  };

  if (error && (!snapshot || !parcel)) {
    return (
      <Screen>
        <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} />
          <Text style={[styles.errorTitle, { color: colors.text, fontFamily: typography.bodySemiBold }]}>
            Connexion au serveur impossible
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 13, textAlign: "center" }}>
            {error}
          </Text>
          <Pressable onPress={load} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontFamily: typography.bodySemiBold, fontSize: 13, marginLeft: 6 }}>
              Réessayer
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!snapshot || !parcel) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </Screen>
    );
  }

  const rainSoon = weather.find((w) => w.pluiePrevue);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader eyebrow={parcel.nom} title="Vue d'ensemble" subtitle={`Culture : ${parcel.culture} · ${stade}`} />

      {error ? (
        <View style={[styles.demoBanner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
          <Text style={{ color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 12 }}>{error}</Text>
        </View>
      ) : null}

      {demoSensors ? (
        <View style={[styles.demoBanner, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Text style={{ color: colors.accent, fontFamily: typography.bodyMedium, fontSize: 12 }}>
            Données de démonstration — le boîtier n'a pas encore envoyé de relevé réel.
          </Text>
        </View>
      ) : null}

      <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <RadialGauge
          value={snapshot.soilMoisturePct}
          threshold={SEUIL_HUMIDITE_PAR_DEFAUT}
          label="Humidité du sol vs seuil d'irrigation"
          size={168}
        />
        <View style={styles.gaugeLegend}>
          <LegendDot color={colors.accent} label="Sous le seuil — irrigation nécessaire" />
          <LegendDot color={colors.success} label="Au-dessus du seuil — sol suffisamment humide" />
        </View>
      </View>

      <View style={[styles.modeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.modeTitle, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Irrigation</Text>
          <Text style={[styles.modeSubtitle, { color: colors.textMuted, fontFamily: typography.body }]}>
            {mode === "auto" ? "Pilotage automatique selon le seuil de la culture" : "Pilotage manuel — vous contrôlez la pompe"}
          </Text>
        </View>
        <Pressable
          onPress={canControl ? toggleMode : undefined}
          disabled={!canControl}
          style={[styles.pill, { backgroundColor: mode === "auto" ? colors.successSoft : colors.accentSoft }]}
        >
          <Text style={{ color: mode === "auto" ? colors.success : colors.accent, fontFamily: typography.bodySemiBold, fontSize: 12 }}>
            {mode === "auto" ? "AUTO" : "MANUEL"}
          </Text>
        </Pressable>
      </View>

      {mode === "manuel" && canControl ? (
        <Pressable
          onPress={togglePump}
          style={[
            styles.pumpButton,
            { backgroundColor: pumpOn ? colors.danger : colors.primary },
          ]}
        >
          <Ionicons name={pumpOn ? "stop-circle-outline" : "water-outline"} size={20} color="#fff" />
          <Text style={styles.pumpButtonText}>{pumpOn ? "Arrêter la pompe" : "Démarrer la pompe"}</Text>
        </Pressable>
      ) : null}

      {!canControl ? (
        <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginBottom: spacing.sm }}>
          Vous consultez cette parcelle en observateur : le pilotage de l'irrigation est réservé au propriétaire et aux membres.
        </Text>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Capteurs</Text>
      <View style={styles.grid}>
        <SensorCard icon="thermometer-outline" label="Température" value={`${snapshot.temperatureC.toFixed(1)}°C`} />
        <SensorCard icon="water-outline" label="Humidité de l'air" value={`${snapshot.humidityAirPct.toFixed(0)}%`} />
        <SensorCard icon="sunny-outline" label="Luminosité" value={`${Math.round(snapshot.lux).toLocaleString()} lux`} />
        <SensorCard icon="flask-outline" label="pH du sol" value={snapshot.soilPh.toFixed(1)} />
        <SensorCard
          icon="beaker-outline"
          label="Niveau d'eau"
          value={`${snapshot.waterLevelPct.toFixed(0)}%`}
          tone={snapshot.waterLevelPct < 20 ? "danger" : "default"}
        />
        <SensorCard
          icon="walk-outline"
          label="Mouvement"
          value={snapshot.motion ? "Détecté" : "Aucun"}
          tone={snapshot.motion ? "accent" : "default"}
        />
        <SensorCard icon="battery-half-outline" label="Batterie" value={`${snapshot.batteryPct.toFixed(0)}%`} />
        <SensorCard icon="speedometer-outline" label="Débit cumulé" value={`${snapshot.flowTotalL.toFixed(0)} L`} />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>Météo (5 jours)</Text>
      <View style={[styles.weatherCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {rainSoon ? (
          <View style={[styles.rainBanner, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="rainy-outline" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: typography.bodyMedium, fontSize: 12, marginLeft: 6 }}>
              Pluie prévue le {rainSoon.date} ({rainSoon.pluieMm} mm) — anticipez vos décisions d'irrigation
            </Text>
          </View>
        ) : null}
        <View style={styles.weatherRow}>
          {weather.map((d) => (
            <View key={d.date} style={styles.weatherDay}>
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }}>{d.date.slice(5)}</Text>
              <Ionicons
                name={d.pluiePrevue ? "rainy-outline" : "sunny-outline"}
                size={18}
                color={d.pluiePrevue ? colors.accent : colors.success}
                style={{ marginVertical: 4 }}
              />
              <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 12 }}>
                {Math.round(d.tempMaxC)}°
              </Text>
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }}>
                {Math.round(d.tempMinC)}°
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 12, flex: 1 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  demoBanner: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  errorTitle: { fontSize: 15, marginTop: spacing.sm, marginBottom: 6 },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.md,
  },
  gaugeCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.md,
  },  gaugeLegend: { marginTop: spacing.md, width: "100%" },
  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  modeTitle: { fontSize: 15 },
  modeSubtitle: { fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  pumpButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  pumpButtonText: { color: "#fff", fontFamily: typography.bodySemiBold, fontSize: 14, marginLeft: 8 },
  sectionLabel: { fontSize: 14, marginBottom: spacing.sm, marginTop: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  weatherCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  rainBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  weatherRow: { flexDirection: "row", justifyContent: "space-between" },
  weatherDay: { alignItems: "center", flex: 1 },
});
