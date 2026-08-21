// ============================================================
// Boîtier RX35 (firmware) -> backend.
//
// La clé envoyée dans X-Device-Key identifie le boîtier ET sa parcelle :
// le firmware n'a aucun identifiant de parcelle à connaître, et ne peut
// pas écrire dans une parcelle qui n'est pas la sienne.
//
// Changement par rapport à la version précédente : la clé n'est plus
// partagée entre tous les boîtiers, chacun a la sienne (créée depuis
// l'application, écran Réglages).
// ============================================================
import { Router } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import multer from "multer";
import {
  addSensorSnapshot,
  addNpkSnapshot,
  addAlert,
  addPhoto,
  getCommands,
  SensorSnapshot,
  NpkSnapshot,
  PhotoItem,
} from "../db/store";
import { requireDevice } from "../middleware/auth";

export const deviceRouter = Router();
deviceRouter.use(requireDevice);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "data", "photos");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
export const photosUploadDir = UPLOAD_DIR;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}_${crypto.randomUUID()}${path.extname(file.originalname) || ".jpg"}`),
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

deviceRouter.post("/sensors", async (req, res, next) => {
  const b = req.body ?? {};
  const required = ["temperatureC", "humidityAirPct", "soilMoisturePct", "waterLevelPct"];
  const missing = required.filter((k) => typeof b[k] !== "number");
  if (missing.length) {
    return res.status(400).json({ error: `Champs manquants ou invalides : ${missing.join(", ")}` });
  }
  const snapshot: SensorSnapshot = {
    timestamp: typeof b.timestamp === "number" ? b.timestamp : Date.now() / 1000,
    temperatureC: b.temperatureC,
    humidityAirPct: b.humidityAirPct,
    pressureHpa: b.pressureHpa ?? 0,
    lux: b.lux ?? 0,
    soilMoisturePct: b.soilMoisturePct,
    soilPh: b.soilPh ?? 0,
    waterLevelPct: b.waterLevelPct,
    flowLpm: b.flowLpm ?? 0,
    flowTotalL: b.flowTotalL ?? 0,
    batteryPct: b.batteryPct ?? 0,
    motion: !!b.motion,
  };
  try {
    await addSensorSnapshot(req.parcelId!, snapshot);
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

deviceRouter.post("/npk", async (req, res, next) => {
  const b = req.body ?? {};
  const required = ["nitrogenMgKg", "phosphorusMgKg", "potassiumMgKg"];
  const missing = required.filter((k) => typeof b[k] !== "number");
  if (missing.length) {
    return res.status(400).json({ error: `Champs manquants ou invalides : ${missing.join(", ")}` });
  }
  const snapshot: NpkSnapshot = {
    timestamp: typeof b.timestamp === "number" ? b.timestamp : Date.now() / 1000,
    nitrogenMgKg: b.nitrogenMgKg,
    phosphorusMgKg: b.phosphorusMgKg,
    potassiumMgKg: b.potassiumMgKg,
    conductivityUsCm: b.conductivityUsCm ?? 0,
  };
  try {
    await addNpkSnapshot(req.parcelId!, snapshot);
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

deviceRouter.post("/alerts", async (req, res, next) => {
  const { type, message } = req.body ?? {};
  // "mouvement" reste accepté pour un PIR seul, incapable de distinguer.
  // Un boîtier équipé d'une caméra et d'une classification remonte
  // directement "presence_humaine" ou "passage_animal".
  const types = [
    "mouvement",
    "presence_humaine",
    "passage_animal",
    "niveau_eau",
    "alarme",
    "badge_refuse",
    "info",
  ];
  if (!types.includes(type) || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: `Champs 'type' (${types.join("|")}) et 'message' requis.` });
  }
  try {
    res.status(201).json(await addAlert(req.parcelId!, { type, message: message.trim() }));
  } catch (e) {
    next(e);
  }
});

deviceRouter.post("/photos", upload.single("photo"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "Champ 'photo' (multipart/form-data) manquant." });
  const photo: PhotoItem = {
    id: crypto.randomUUID(),
    timestamp: Date.now() / 1000,
    uri: `/photos/files/${req.file.filename}`,
    type: req.body?.type === "mouvement" ? "mouvement" : "periodique",
  };
  try {
    await addPhoto(req.parcelId!, photo);
    res.status(201).json(photo);
  } catch (e) {
    next(e);
  }
});

// Le boîtier relit l'intention de pilotage à chaque cycle (il n'accepte
// pas de connexion entrante). La sécurité de niveau d'eau reste appliquée
// côté firmware : le backend transmet une intention, jamais un
// contournement de cette sécurité.
deviceRouter.get("/commands", async (req, res, next) => {
  try {
    res.json(await getCommands(req.parcelId!));
  } catch (e) {
    next(e);
  }
});
