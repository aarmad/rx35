// ============================================================
// Données d'une parcelle, lues par l'application.
//
// Monté sur /api/parcels/:parcelId derrière requireParcelAccess : à ce
// stade req.parcelId et req.role sont garantis.
// ============================================================
import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import {
  addSensorSnapshot,
  getLatestSensorSnapshot,
  getSensorHistory,
  getLatestNpkSnapshot,
  getAlerts,
  markAlertRead,
  getUnreadAlertCount,
  getPhotos,
  getPhotoNear,
  getCommands,
  setIrrigationMode,
  setPumpManual,
  getChatHistory,
  addChatMessage,
  getParcel,
  ChatMessage,
} from "../db/store";
import { requireRole } from "../middleware/auth";
import { fetchWeather } from "../services/weatherService";
import { getNdviSnapshot, getAvailableNdviDates } from "../services/satelliteService";
import { construireRecommandations } from "../services/agronomie";
import { askAssistant, diagnosePhoto } from "../services/aiProvider";

// mergeParams : sans cela, :parcelId du routeur parent est invisible ici.
export const parcelDataRouter = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// --- Capteurs ---
parcelDataRouter.get("/sensors/latest", async (req, res, next) => {
  try {
    const snapshot = await getLatestSensorSnapshot(req.parcelId!);
    if (!snapshot) return res.status(404).json({ error: "Aucune donnée reçue du boîtier pour l'instant." });
    res.json(snapshot);
  } catch (e) {
    next(e);
  }
});

parcelDataRouter.get("/sensors/history", async (req, res, next) => {
  try {
    const period = Number(req.query.period ?? 7);
    const since = Date.now() / 1000 - period * 86400;
    res.json(await getSensorHistory(req.parcelId!, since));
  } catch (e) {
    next(e);
  }
});

// --- Relevé de test ----------------------------------------------------
// Le rapport de test demandait de pouvoir faire varier les mesures pour
// valider le système sans boîtier physique. Ce relevé est enregistré avec
// simule = true : il alimente les écrans et les conseils, mais l'historique
// le distingue d'une vraie mesure. Réservé au propriétaire de la parcelle.
parcelDataRouter.post("/simulation/releve", requireRole("proprietaire"), async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const nombre = (v: any, defaut: number) => (typeof v === "number" && isFinite(v) ? v : defaut);
    const alea = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

    // Sans valeur fournie, on tire au hasard : le but est justement de VOIR
    // les écrans bouger, ce qu'une valeur fixe ne permet pas.
    await addSensorSnapshot(req.parcelId!, {
      timestamp: Date.now() / 1000,
      temperatureC: nombre(b.temperatureC, alea(24, 36)),
      humidityAirPct: nombre(b.humidityAirPct, alea(45, 85)),
      pressureHpa: nombre(b.pressureHpa, 1012),
      lux: nombre(b.lux, alea(200, 1100)),
      soilMoisturePct: nombre(b.soilMoisturePct, alea(15, 90)),
      soilPh: nombre(b.soilPh, 6.3),
      waterLevelPct: nombre(b.waterLevelPct, alea(5, 100)),
      flowLpm: nombre(b.flowLpm, 0),
      flowTotalL: nombre(b.flowTotalL, 0),
      batteryPct: nombre(b.batteryPct, alea(30, 100)),
      motion: !!b.motion,
      simule: true,
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- Recommandations agronomiques -------------------------------------
// Croise relevés, tendance, météo et alertes. Règles déterministes : voir
// l'en-tête de services/agronomie.ts pour le pourquoi.
parcelDataRouter.get("/recommandations", async (req, res, next) => {
  try {
    const parcelId = req.parcelId!;
    const parcel = await getParcel(parcelId);
    if (!parcel) return res.status(404).json({ error: "Parcelle introuvable." });

    const depuis = Date.now() / 1000 - 7 * 86400;
    // La météo dépend d'un service externe : son échec ne doit pas priver
    // l'agriculteur des conseils tirés de ses propres capteurs.
    const [dernier, historique, npk, alertes, irrigation, meteo] = await Promise.all([
      getLatestSensorSnapshot(parcelId),
      getSensorHistory(parcelId, depuis),
      getLatestNpkSnapshot(parcelId),
      getAlerts(parcelId, req.userId!),
      getCommands(parcelId),
      fetchWeather(parcel.latitude, parcel.longitude).catch(() => []),
    ]);

    res.json(
      construireRecommandations({
        culture: parcel.culture,
        datePlantation: parcel.datePlantation,
        dernier,
        historique,
        npk,
        meteo,
        alertes,
        irrigation,
      })
    );
  } catch (e) {
    next(e);
  }
});

parcelDataRouter.get("/npk/latest", async (req, res, next) => {
  try {
    const snapshot = await getLatestNpkSnapshot(req.parcelId!);
    if (!snapshot) return res.status(404).json({ error: "Aucune donnée NPK reçue pour l'instant." });
    res.json(snapshot);
  } catch (e) {
    next(e);
  }
});

// --- Irrigation ---
parcelDataRouter.get("/irrigation/state", async (req, res, next) => {
  try {
    const c = await getCommands(req.parcelId!);
    res.json({ mode: c.irrigationMode, pumpManualOn: c.pumpManualOn });
  } catch (e) {
    next(e);
  }
});

// Un observateur consulte mais ne pilote pas la pompe.
parcelDataRouter.put("/irrigation/mode", requireRole("proprietaire", "membre"), async (req, res, next) => {
  const mode = req.body?.mode;
  if (mode !== "auto" && mode !== "manuel") {
    return res.status(400).json({ error: "mode doit être 'auto' ou 'manuel'." });
  }
  try {
    res.json(await setIrrigationMode(req.parcelId!, mode, req.userId!));
  } catch (e) {
    next(e);
  }
});

parcelDataRouter.put("/irrigation/pump", requireRole("proprietaire", "membre"), async (req, res, next) => {
  try {
    res.json(await setPumpManual(req.parcelId!, !!req.body?.on, req.userId!));
  } catch (e) {
    next(e);
  }
});

// --- Alertes (état "lu" propre à chaque membre) ---
parcelDataRouter.get("/alerts", async (req, res, next) => {
  try {
    res.json(await getAlerts(req.parcelId!, req.userId!));
  } catch (e) {
    next(e);
  }
});

parcelDataRouter.get("/alerts/unread-count", async (req, res, next) => {
  try {
    res.json({ count: await getUnreadAlertCount(req.parcelId!, req.userId!) });
  } catch (e) {
    next(e);
  }
});

parcelDataRouter.put("/alerts/:alertId/read", async (req, res, next) => {
  try {
    await markAlertRead(req.params.alertId, req.userId!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// --- Photos ---
parcelDataRouter.get("/photos", async (req, res, next) => {
  try {
    res.json(await getPhotos(req.parcelId!));
  } catch (e) {
    next(e);
  }
});

parcelDataRouter.get("/photos/near", async (req, res, next) => {
  const ts = Number(req.query.timestamp);
  if (!ts) return res.status(400).json({ error: "Paramètre 'timestamp' (epoch) requis." });
  const tolerance = Number(req.query.tolerance);
  try {
    const photo = await getPhotoNear(
      req.parcelId!,
      ts,
      Number.isFinite(tolerance) && tolerance > 0 ? tolerance : undefined
    );
    if (!photo) return res.status(404).json({ error: "Aucune photo proche de cet horodatage." });
    res.json(photo);
  } catch (e) {
    next(e);
  }
});

// --- Météo et satellite : dépendent des coordonnées de LA parcelle ---
parcelDataRouter.get("/weather", async (req, res, next) => {
  try {
    const parcel = await getParcel(req.parcelId!);
    res.json(await fetchWeather(parcel!.latitude, parcel!.longitude));
  } catch (err) {
    console.error("[weather]", err);
    res.status(502).json({ error: "Service météo indisponible pour le moment." });
  }
});

parcelDataRouter.get("/satellite/dates", (_req, res) => {
  res.json(getAvailableNdviDates());
});

parcelDataRouter.get("/satellite/ndvi", async (req, res, next) => {
  const date = String(req.query.date ?? getAvailableNdviDates()[0]);
  try {
    const parcel = await getParcel(req.parcelId!);
    res.json(await getNdviSnapshot(parcel!.latitude, parcel!.longitude, date));
  } catch (e) {
    next(e);
  }
});

// --- Assistant IA (conversation propre à chaque membre) ---
parcelDataRouter.get("/assistant/history", async (req, res, next) => {
  try {
    res.json(await getChatHistory(req.parcelId!, req.userId!));
  } catch (e) {
    next(e);
  }
});

parcelDataRouter.post("/assistant/message", async (req, res, next) => {
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Champ 'text' requis." });
  }
  try {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text, timestamp: Date.now() / 1000 };
    await addChatMessage(req.parcelId!, req.userId!, userMsg);

    const [parcel, snapshot, history] = await Promise.all([
      getParcel(req.parcelId!),
      getLatestSensorSnapshot(req.parcelId!),
      getChatHistory(req.parcelId!, req.userId!),
    ]);
    const replyText = await askAssistant(text, parcel!, snapshot, history.map((m) => ({ role: m.role, text: m.text })));

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: replyText,
      timestamp: Date.now() / 1000,
    };
    await addChatMessage(req.parcelId!, req.userId!, assistantMsg);
    res.status(201).json(assistantMsg);
  } catch (err: any) {
    console.error("[assistant]", err);
    res.status(502).json({ error: err?.message ?? "Assistant IA indisponible pour le moment." });
  }
});

parcelDataRouter.post("/assistant/photo", upload.single("photo"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "Champ 'photo' (multipart/form-data) manquant." });
  const base64 = req.file.buffer.toString("base64");
  const mimeType = req.file.mimetype || "image/jpeg";

  try {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: "Photo envoyée pour diagnostic",
      imageUri: `data:${mimeType};base64,${base64}`,
      timestamp: Date.now() / 1000,
    };
    await addChatMessage(req.parcelId!, req.userId!, userMsg);

    const parcel = await getParcel(req.parcelId!);
    const replyText = await diagnosePhoto(base64, mimeType, parcel!);
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: replyText,
      timestamp: Date.now() / 1000,
    };
    await addChatMessage(req.parcelId!, req.userId!, assistantMsg);
    res.status(201).json(assistantMsg);
  } catch (err: any) {
    console.error("[assistant/photo]", err);
    res.status(502).json({ error: err?.message ?? "Diagnostic photo indisponible pour le moment." });
  }
});
