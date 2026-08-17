// ============================================================
// Store de données — fichier JSON local (data/db.json).
//
// Choix volontaire pour cette étape : pas de dépendance à une base de
// données externe (Postgres, etc.) pour rester facile à installer et
// tester partout. Migrer vers une vraie base plus tard ne demande de
// changer QUE ce fichier — routes et services n'accèdent jamais au disque
// directement, toujours via les fonctions exportées ici.
// ============================================================
import fs from "fs";
import path from "path";

export type Culture = "tomate" | "mais" | "riz" | "piment" | "oignon";

export interface ParcelInfo {
  nom: string;
  culture: Culture;
  datePlantation: string;
  latitude: number;
  longitude: number;
}

export interface SensorSnapshot {
  timestamp: number;
  temperatureC: number;
  humidityAirPct: number;
  pressureHpa: number;
  lux: number;
  soilMoisturePct: number;
  soilPh: number;
  waterLevelPct: number;
  flowLpm: number;
  flowTotalL: number;
  batteryPct: number;
  motion: boolean;
}

export interface NpkSnapshot {
  timestamp: number;
  nitrogenMgKg: number;
  phosphorusMgKg: number;
  potassiumMgKg: number;
  conductivityUsCm: number;
}

export interface AlertItem {
  id: string;
  timestamp: number;
  type: "mouvement" | "niveau_eau" | "alarme" | "badge_refuse" | "info";
  message: string;
  lu: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUri?: string;
  timestamp: number;
}

export interface PhotoItem {
  id: string;
  timestamp: number;
  uri: string;
  type: "periodique" | "mouvement";
}

export interface DeviceCommands {
  irrigationMode: "auto" | "manuel";
  pumpManualOn: boolean;
}

export interface UserAccount {
  id: string;
  nom: string;
  telephone: string;
  passwordHash: string;
  createdAt: number;
}

interface DbShape {
  parcel: ParcelInfo;
  sensorHistory: SensorSnapshot[];
  npkHistory: NpkSnapshot[];
  alerts: AlertItem[];
  chatHistory: ChatMessage[];
  photos: PhotoItem[];
  commands: DeviceCommands;
  users: UserAccount[];
}

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const DEFAULT_DB: DbShape = {
  parcel: {
    nom: "Parcelle 1 — Lomé Nord",
    culture: "tomate",
    datePlantation: "2026-07-20",
    latitude: 6.1725,
    longitude: 1.2314,
  },
  sensorHistory: [],
  npkHistory: [],
  alerts: [],
  chatHistory: [
    {
      id: "c0",
      role: "assistant",
      text: "Bonjour ! Je suis l'assistant RX35. Demandez-moi l'état de votre parcelle, l'historique récent, ou envoyez une photo pour un diagnostic.",
      timestamp: Date.now() / 1000,
    },
  ],
  photos: [],
  commands: { irrigationMode: "auto", pumpManualOn: false },
  users: [],
};

function ensureDb(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb(): DbShape {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const db = JSON.parse(raw) as DbShape;
  // Filet de sécurité pour les fichiers db.json créés avant l'ajout d'un
  // champ (ex. "users") : évite un crash si le fichier est plus ancien
  // que le code qui le lit.
  db.users = db.users ?? [];
  db.photos = db.photos ?? [];
  db.alerts = db.alerts ?? [];
  db.sensorHistory = db.sensorHistory ?? [];
  db.npkHistory = db.npkHistory ?? [];
  db.chatHistory = db.chatHistory ?? [];
  return db;
}

function writeDb(db: DbShape): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Toutes les opérations relisent puis réécrivent le fichier entier : très
// bien pour un seul boîtier + une app de démo, à revoir (vraie base, accès
// concurrent) avant un déploiement multi-parcelles à grande échelle.

export function getParcel(): ParcelInfo {
  return readDb().parcel;
}

export function updateParcel(update: Partial<ParcelInfo>): ParcelInfo {
  const db = readDb();
  db.parcel = { ...db.parcel, ...update };
  writeDb(db);
  return db.parcel;
}

const MAX_SENSOR_HISTORY = 20000;

export function addSensorSnapshot(snapshot: SensorSnapshot): void {
  const db = readDb();
  db.sensorHistory.push(snapshot);
  if (db.sensorHistory.length > MAX_SENSOR_HISTORY) {
    db.sensorHistory = db.sensorHistory.slice(-MAX_SENSOR_HISTORY);
  }
  writeDb(db);
}

export function getLatestSensorSnapshot(): SensorSnapshot | null {
  const db = readDb();
  return db.sensorHistory.length ? db.sensorHistory[db.sensorHistory.length - 1] : null;
}

export function getSensorHistory(sinceEpoch: number): SensorSnapshot[] {
  const db = readDb();
  return db.sensorHistory.filter((s) => s.timestamp >= sinceEpoch);
}

export function addNpkSnapshot(snapshot: NpkSnapshot): void {
  const db = readDb();
  db.npkHistory.push(snapshot);
  if (db.npkHistory.length > 5000) db.npkHistory = db.npkHistory.slice(-5000);
  writeDb(db);
}

export function getLatestNpkSnapshot(): NpkSnapshot | null {
  const db = readDb();
  return db.npkHistory.length ? db.npkHistory[db.npkHistory.length - 1] : null;
}

export function addAlert(alert: AlertItem): void {
  const db = readDb();
  db.alerts.unshift(alert);
  if (db.alerts.length > 2000) db.alerts = db.alerts.slice(0, 2000);
  writeDb(db);
}

export function getAlerts(): AlertItem[] {
  return readDb().alerts.sort((a, b) => b.timestamp - a.timestamp);
}

export function markAlertRead(id: string): boolean {
  const db = readDb();
  const alert = db.alerts.find((a) => a.id === id);
  if (!alert) return false;
  alert.lu = true;
  writeDb(db);
  return true;
}

export function getUnreadAlertCount(): number {
  return readDb().alerts.filter((a) => !a.lu).length;
}

export function getChatHistory(): ChatMessage[] {
  return readDb().chatHistory;
}

export function addChatMessage(msg: ChatMessage): void {
  const db = readDb();
  db.chatHistory.push(msg);
  if (db.chatHistory.length > 500) db.chatHistory = db.chatHistory.slice(-500);
  writeDb(db);
}

export function addPhoto(photo: PhotoItem): void {
  const db = readDb();
  db.photos.unshift(photo);
  if (db.photos.length > 2000) db.photos = db.photos.slice(0, 2000);
  writeDb(db);
}

export function getPhotos(): PhotoItem[] {
  return readDb().photos.sort((a, b) => b.timestamp - a.timestamp);
}

export function getPhotoNear(timestamp: number, toleranceSeconds = 1800): PhotoItem | null {
  const photos = getPhotos();
  let closest: PhotoItem | null = null;
  let bestDiff = Infinity;
  for (const p of photos) {
    const diff = Math.abs(p.timestamp - timestamp);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = p;
    }
  }
  return closest && bestDiff <= toleranceSeconds ? closest : null;
}

export function getCommands(): DeviceCommands {
  return readDb().commands;
}

export function setIrrigationMode(mode: "auto" | "manuel"): DeviceCommands {
  const db = readDb();
  db.commands.irrigationMode = mode;
  writeDb(db);
  return db.commands;
}

export function setPumpManual(on: boolean): DeviceCommands {
  const db = readDb();
  db.commands.pumpManualOn = on;
  writeDb(db);
  return db.commands;
}

// --- Comptes utilisateurs ---
export function createUser(user: UserAccount): void {
  const db = readDb();
  db.users.push(user);
  writeDb(db);
}

export function findUserByPhone(telephone: string): UserAccount | null {
  const db = readDb();
  return db.users.find((u) => u.telephone === telephone) ?? null;
}

export function findUserById(id: string): UserAccount | null {
  const db = readDb();
  return db.users.find((u) => u.id === id) ?? null;
}

export function updateUser(id: string, update: Partial<Pick<UserAccount, "nom" | "telephone">>): UserAccount | null {
  const db = readDb();
  const user = db.users.find((u) => u.id === id);
  if (!user) return null;
  Object.assign(user, update);
  writeDb(db);
  return user;
}
