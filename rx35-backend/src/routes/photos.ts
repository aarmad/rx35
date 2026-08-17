import { Router } from "express";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import fs from "fs";
import { addPhoto, getPhotos, getPhotoNear, PhotoItem } from "../db/store";
import { requireDeviceKey, requireAuth } from "../middleware/auth";

export const photosRouter = Router();

const UPLOAD_DIR = path.join(__dirname, "..", "..", "data", "photos");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${crypto.randomUUID()}${path.extname(file.originalname) || ".jpg"}`),
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

// Boîtier (ESP32-CAM) -> backend : capture périodique ou sur mouvement.
// Voir rx35-firmware-cam/src/main.cpp — le TODO d'envoi HTTP y pointe ici.
photosRouter.post("/", requireDeviceKey, upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Champ 'photo' (multipart/form-data) manquant." });
  const type = req.body?.type === "mouvement" ? "mouvement" : "periodique";

  const photo: PhotoItem = {
    id: crypto.randomUUID(),
    timestamp: Date.now() / 1000,
    uri: `/photos/files/${req.file.filename}`,
    type,
  };
  addPhoto(photo);
  res.status(201).json(photo);
});

photosRouter.get("/", requireAuth, (_req, res) => {
  res.json(getPhotos());
});

photosRouter.get("/near", requireAuth, (req, res) => {
  const ts = Number(req.query.timestamp);
  if (!ts) return res.status(400).json({ error: "Paramètre 'timestamp' (epoch) requis." });
  // L'app transmet la tolérance qu'elle souhaite (en secondes) ; sans ce
  // paramètre on garde la valeur par défaut du store (30 min).
  const tolerance = Number(req.query.tolerance);
  const photo = getPhotoNear(ts, Number.isFinite(tolerance) && tolerance > 0 ? tolerance : undefined);
  if (!photo) return res.status(404).json({ error: "Aucune photo proche de cet horodatage." });
  res.json(photo);
});

// Fichiers statiques servis directement (voir aussi index.ts pour le
// montage de /photos/files en tant que dossier statique).
export const photosUploadDir = UPLOAD_DIR;
