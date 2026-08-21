import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, ActivityIndicator, Image, Modal } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppTheme } from "@/theme/ThemeContext";
import { useParcel } from "@/parcels/ParcelContext";
import { typography, spacing, radius } from "@/theme/tokens";
import { getSensorHistory, getPhotos, getPhotoNear, getAlerts } from "@/services/api";
import { avecCache } from "@/services/cache";
import { AlertItem, PhotoItem, SensorSnapshot } from "@/services/types";

type Period = 1 | 7 | 30;
type Tab = "mesures" | "galerie";

const METRICS: { key: keyof SensorSnapshot; label: string; suffix: string }[] = [
  { key: "temperatureC", label: "Température", suffix: "°C" },
  { key: "soilMoisturePct", label: "Humidité du sol", suffix: "%" },
  { key: "soilPh", label: "pH du sol", suffix: "" },
  { key: "lux", label: "Luminosité", suffix: " lux" },
];

const screenWidth = Dimensions.get("window").width - spacing.lg * 2 - spacing.md * 2;

function timeLabel(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
}

/** « il y a 40 min », « il y a 3h », « il y a 2 j » — plus parlant qu'une date. */
function ilYA(ts: number): string {
  const minutes = Math.max(0, Math.round(Date.now() / 1000 - ts) / 60);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${Math.round(minutes)} min`;
  const heures = minutes / 60;
  if (heures < 24) return `il y a ${Math.round(heures)}h`;
  const jours = Math.round(heures / 24);
  return `il y a ${jours} j`;
}

// Chaque type d'alerte du boîtier a son icône et sa couleur.
const APPARENCE: Record<AlertItem["type"], { icon: string; colorKey: "success" | "accent" }> = {
  mouvement: { icon: "walk", colorKey: "accent" },
  presence_humaine: { icon: "body", colorKey: "accent" },
  // Un passage d'animal est une information, pas une alerte de sécurité.
  passage_animal: { icon: "paw", colorKey: "success" },
  niveau_eau: { icon: "water", colorKey: "accent" },
  alarme: { icon: "alert", colorKey: "accent" },
  badge_refuse: { icon: "key", colorKey: "accent" },
  info: { icon: "information-circle", colorKey: "success" },
};

export default function HistoryScreen() {
  const { colors } = useAppTheme();
  const { current: parcel } = useParcel();
  const [tab, setTab] = useState<Tab>("mesures");
  const [period, setPeriod] = useState<Period>(7);
  const [history, setHistory] = useState<SensorSnapshot[]>([]);
  const [metricIndex, setMetricIndex] = useState(1);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [evenements, setEvenements] = useState<AlertItem[]>([]);
  // Photo capturée au moment d'un événement, indexée par identifiant d'alerte.
  const [photosEvenement, setPhotosEvenement] = useState<Record<string, PhotoItem>>({});
  const [viewerPhoto, setViewerPhoto] = useState<PhotoItem | null>(null);
  const [horsConnexion, setHorsConnexion] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    // Hors connexion, on ressort l'historique réellement téléchargé la
    // dernière fois — pas une série inventée : un graphique de
    // démonstration pourrait être pris pour l'état du sol.
    avecCache(`${parcel!.id}:historique:${period}`, () => getSensorHistory(parcel!.id, period))
      .then((r) => {
        setHistory(r.data);
        setHorsConnexion(r.horsConnexion ? r.savedAt ?? null : null);
      })
      .catch(() => {
        setHistory([]);
        setHorsConnexion(null);
      })
      .finally(() => setLoading(false));
  }, [period, parcel?.id]);

  useEffect(() => {
    avecCache(`${parcel!.id}:photos`, () => getPhotos(parcel!.id))
      .then((r) => setPhotos(r.data))
      .catch(() => setPhotos([]));

    // Journal des événements : les vraies alertes remontées par le boîtier.
    // (Il affichait autrefois trois lignes écrites en dur — une irrigation
    // et un mouvement qui n'avaient jamais eu lieu.)
    avecCache(`${parcel!.id}:alertes`, () => getAlerts(parcel!.id))
      .then(async (r) => {
        const derniers = [...r.data].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
        setEvenements(derniers);
        // Le boîtier photographie ce qui bouge : on rattache l'image à
        // l'événement pour que l'agriculteur voie de quoi il s'agit.
        const trouvees: Record<string, PhotoItem> = {};
        await Promise.all(
          derniers
            .filter((a) => a.type === "mouvement")
            .map(async (a) => {
              try {
                const p = await getPhotoNear(parcel!.id, a.timestamp);
                if (p) trouvees[a.id] = p;
              } catch {
                // Pas de photo pour cet événement : la ligne s'affiche sans.
              }
            })
        );
        setPhotosEvenement(trouvees);
      })
      .catch(() => setEvenements([]));
  }, [parcel?.id]);

  const metric = METRICS[metricIndex];
  const values = history.map((h) => Number(h[metric.key]));
  const labels = history.map((h, i) => {
    if (history.length > 10 && i % Math.ceil(history.length / 6) !== 0) return "";
    const d = new Date(h.timestamp * 1000);
    return period === 1 ? `${d.getHours()}h` : `${d.getDate()}/${d.getMonth() + 1}`;
  });

  return (
    <Screen>
      <ScreenHeader eyebrow="Journal des mesures" title="Historique" subtitle="Évolution des capteurs, événements et photos capturées" />

      {horsConnexion ? (
        <View style={[styles.demoBanner, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Text style={{ color: colors.accent, fontFamily: typography.bodyMedium, fontSize: 12 }}>
            Hors connexion — historique téléchargé le{" "}
            {new Date(horsConnexion * 1000).toLocaleDateString("fr-FR")}.
          </Text>
        </View>
      ) : null}

      {!loading && history.length === 0 ? (
        <View style={[styles.demoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.textMuted, fontFamily: typography.bodyMedium, fontSize: 12 }}>
            Aucune mesure sur cette période.
          </Text>
        </View>
      ) : null}

      <View style={[styles.segmented, { borderColor: colors.border }]}>
        {(["mesures", "galerie"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.segmentBtn, tab === t && { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: tab === t ? "#fff" : colors.text, fontFamily: typography.bodyMedium, fontSize: 13 }}>
              {t === "mesures" ? "Mesures" : "Galerie photo"}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "mesures" ? (
        <>
          <View style={styles.periodRow}>
            {([1, 7, 30] as Period[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[
                  styles.periodChip,
                  { backgroundColor: period === p ? colors.primary : colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={{ color: period === p ? "#fff" : colors.text, fontFamily: typography.bodyMedium, fontSize: 12 }}>
                  {p === 1 ? "Aujourd'hui" : `${p} jours`}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.metricRow}>
            {METRICS.map((m, i) => (
              <Pressable
                key={m.key}
                onPress={() => setMetricIndex(i)}
                style={[
                  styles.metricChip,
                  { backgroundColor: metricIndex === i ? colors.accentSoft : "transparent", borderColor: colors.border },
                ]}
              >
                <Text
                  style={{
                    color: metricIndex === i ? colors.accent : colors.textMuted,
                    fontFamily: typography.bodyMedium,
                    fontSize: 12,
                  }}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.xxl }} />
            ) : (
              <LineChart
                data={{ labels, datasets: [{ data: values.length ? values : [0] }] }}
                width={screenWidth}
                height={200}
                withInnerLines={false}
                withOuterLines={false}
                withDots={false}
                yAxisSuffix={metric.suffix}
                chartConfig={{
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: metric.key === "soilPh" ? 1 : 0,
                  color: () => colors.primary,
                  labelColor: () => colors.textMuted,
                  propsForBackgroundLines: { stroke: colors.border },
                }}
                bezier
                style={{ borderRadius: radius.md, marginLeft: -spacing.md }}
              />
            )}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.bodySemiBold }]}>
            Journal des événements
          </Text>
          <View style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {evenements.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 13 }}>
                Aucun événement signalé par le boîtier pour l'instant.
              </Text>
            ) : (
              evenements.map((e) => {
                const photo = photosEvenement[e.id];
                return (
                  <EventRow
                    key={e.id}
                    icon={APPARENCE[e.type].icon}
                    label={e.message}
                    time={ilYA(e.timestamp)}
                    colorKey={APPARENCE[e.type].colorKey}
                    photo={photo}
                    onPhotoPress={() => photo && setViewerPhoto(photo)}
                  />
                );
              })
            )}
          </View>
        </>
      ) : (
        <View style={styles.galleryGrid}>
          {photos.map((p) => (
            <Pressable key={p.id} onPress={() => setViewerPhoto(p)} style={styles.galleryCell}>
              <Image source={{ uri: p.uri }} style={styles.galleryImage} />
              <View style={[styles.galleryBadge, { backgroundColor: p.type === "mouvement" ? colors.accent : colors.primary }]}>
                <Ionicons name={p.type === "mouvement" ? "walk" : "time-outline"} size={10} color="#fff" />
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setViewerPhoto(null)} />
          {viewerPhoto ? (
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Image source={{ uri: viewerPhoto.uri }} style={styles.modalImage} />
              <Text style={{ color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14, marginTop: spacing.sm }}>
                {viewerPhoto.type === "mouvement" ? "Capture sur détection de mouvement" : "Capture périodique automatique"}
              </Text>
              <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 2 }}>
                {timeLabel(viewerPhoto.timestamp)}
              </Text>
              <Pressable onPress={() => setViewerPhoto(null)} style={[styles.closeButton, { backgroundColor: colors.primary }]}>
                <Text style={{ color: "#fff", fontFamily: typography.bodyMedium, fontSize: 13 }}>Fermer</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

function EventRow({
  icon,
  label,
  time,
  colorKey,
  photo,
  onPhotoPress,
}: {
  icon: string;
  label: string;
  time: string;
  colorKey: "success" | "accent";
  photo?: PhotoItem;
  onPhotoPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const color = colorKey === "success" ? colors.success : colors.accent;
  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontFamily: typography.body, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }}>{time}</Text>
      </View>
      {photo ? (
        <Pressable onPress={onPhotoPress}>
          <Image source={{ uri: photo.uri }} style={styles.eventThumb} />
        </Pressable>
      ) : null}
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
  segmented: { flexDirection: "row", borderWidth: 1, borderRadius: radius.pill, padding: 3, marginBottom: spacing.md },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  periodRow: { flexDirection: "row", marginBottom: spacing.sm },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  metricRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
  metricChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chartCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.lg, alignItems: "center" },
  sectionLabel: { fontSize: 14, marginBottom: spacing.sm },
  eventCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  eventRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  eventThumb: { width: 40, height: 40, borderRadius: radius.sm, marginLeft: spacing.sm },
  galleryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  galleryCell: { width: "31.5%", aspectRatio: 1, marginBottom: spacing.sm, borderRadius: radius.sm, overflow: "hidden" },
  galleryImage: { width: "100%", height: "100%" },
  galleryBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  modalImage: { width: "100%", aspectRatio: 1, borderRadius: radius.md },
  closeButton: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
});
