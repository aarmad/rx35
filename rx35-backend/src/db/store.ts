// ============================================================
// Accès aux données — PostgreSQL.
//
// Remplace l'ancien fichier JSON local (data/db.json), qui ne survivait
// pas aux redémarrages de l'hébergeur et mélangeait les données de tous
// les utilisateurs.
//
// Règle : les routes n'écrivent jamais de SQL, tout passe par ce fichier.
// Chaque donnée d'exploitation est rattachée à une PARCELLE, et l'accès à
// une parcelle passe par une adhésion (voir getMemberRole).
// ============================================================
import { Pool } from "pg";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type Culture = "tomate" | "mais" | "riz" | "piment" | "oignon";
export type Role = "proprietaire" | "membre" | "observateur";

export interface UserAccount {
  id: string;
  nom: string;
  telephone: string;
  /** Optionnel : sert uniquement à récupérer un accès perdu. */
  email?: string | null;
  passwordHash: string;
  createdAt: number;
}

export interface ParcelInfo {
  id: string;
  nom: string;
  culture: Culture;
  datePlantation: string; // ISO yyyy-mm-dd
  latitude: number;
  longitude: number;
}

export interface ParcelWithRole extends ParcelInfo {
  role: Role;
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
  /**
   * true = relevé de test déclenché depuis l'application, pas une mesure
   * du terrain. Marqué en base et affiché comme tel : un chiffre de test
   * ne doit jamais pouvoir passer pour une mesure réelle.
   */
  simule?: boolean;
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
  type:
    | "mouvement"
    // Distinction demandee au rapport de test : une intrusion humaine
    // et le passage d une chevre n appellent pas la meme reaction.
    | "presence_humaine"
    | "passage_animal"
    | "niveau_eau"
    | "alarme"
    | "badge_refuse"
    | "info";
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

export interface DeviceInfo {
  id: string;
  parcelId: string;
  nom: string;
  lastSeenAt: number | null;
}

// --- Connexion ---------------------------------------------------------

// Render fournit DATABASE_URL. En local, docker-compose / conteneur sur
// le port 5433 (voir README) pour ne pas entrer en conflit avec une
// installation Postgres existante.
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:rx35dev@localhost:5433/rx35";

export const pool = new Pool({
  connectionString,
  // Les bases hébergées (Render, Neon, Supabase) imposent TLS mais
  // présentent un certificat que Node ne valide pas par défaut.
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
});

export async function initDb(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
}

// Postgres renvoie des Date ; l'application manipule des epoch en secondes
// (mêmes unités que le firmware).
const toEpoch = (d: Date | null): number => (d ? d.getTime() / 1000 : 0);
const fromEpoch = (s: number | undefined): Date => new Date((s ?? Date.now() / 1000) * 1000);

// --- Comptes utilisateurs ---------------------------------------------

export async function createUser(user: UserAccount): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, nom, telephone, password_hash) VALUES ($1, $2, $3, $4)`,
    [user.id, user.nom, user.telephone, user.passwordHash]
  );
}

function rowToUser(r: any): UserAccount {
  return {
    id: r.id,
    nom: r.nom,
    telephone: r.telephone,
    email: r.email ?? null,
    passwordHash: r.password_hash,
    createdAt: toEpoch(r.created_at),
  };
}

export async function findUserByPhone(telephone: string): Promise<UserAccount | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE telephone = $1`, [telephone]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findUserById(id: string): Promise<UserAccount | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function updateUser(
  id: string,
  update: Partial<Pick<UserAccount, "nom" | "telephone" | "email">>
): Promise<UserAccount | null> {
  const { rows } = await pool.query(
    `UPDATE users SET
       nom = COALESCE($2, nom),
       telephone = COALESCE($3, telephone),
       email = COALESCE($4, email)
     WHERE id = $1 RETURNING *`,
    [id, update.nom ?? null, update.telephone ?? null, update.email ?? null]
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findUserByEmail(email: string): Promise<UserAccount | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

// --- Réinitialisation de mot de passe ----------------------------------

const MAX_TENTATIVES_CODE = 5;

/** Crée un code à 6 chiffres, valable 15 minutes. Renvoie le code en clair. */
export async function creerCodeReinitialisation(userId: string): Promise<string> {
  // Les demandes précédentes sont invalidées : un seul code actif à la fois.
  await pool.query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await pool.query(
    `INSERT INTO password_resets (id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '15 minutes')`,
    [crypto.randomUUID(), userId, hashKey(code)]
  );
  return code;
}

/**
 * Vérifie un code et, s'il est valide, le consomme. Le compteur de
 * tentatives évite qu'un million d'essais ne vienne à bout de 6 chiffres.
 */
export async function consommerCodeReinitialisation(userId: string, code: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT * FROM password_resets
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const demande = rows[0];
  if (!demande) return false;
  if (demande.attempts >= MAX_TENTATIVES_CODE) return false;

  const attendu = Buffer.from(demande.code_hash, "utf8");
  const fourni = Buffer.from(hashKey(code), "utf8");
  const ok = attendu.length === fourni.length && crypto.timingSafeEqual(attendu, fourni);

  if (!ok) {
    await pool.query(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1`, [demande.id]);
    return false;
  }
  await pool.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [demande.id]);
  return true;
}

// --- Parcelles et adhésions -------------------------------------------

function rowToParcel(r: any): ParcelInfo {
  return {
    id: r.id,
    nom: r.nom,
    culture: r.culture,
    // DATE Postgres -> yyyy-mm-dd sans décalage de fuseau.
    datePlantation:
      r.date_plantation instanceof Date
        ? r.date_plantation.toISOString().slice(0, 10)
        : String(r.date_plantation).slice(0, 10),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
  };
}

export async function createParcel(
  ownerId: string,
  data: { nom: string; culture?: Culture; datePlantation?: string; latitude?: number; longitude?: number }
): Promise<ParcelInfo> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = crypto.randomUUID();
    const { rows } = await client.query(
      `INSERT INTO parcels (id, nom, culture, date_plantation, latitude, longitude)
       VALUES ($1, $2, COALESCE($3,'tomate'), COALESCE($4, CURRENT_DATE), COALESCE($5, 6.1725), COALESCE($6, 1.2314))
       RETURNING *`,
      [id, data.nom, data.culture ?? null, data.datePlantation ?? null, data.latitude ?? null, data.longitude ?? null]
    );
    await client.query(
      `INSERT INTO parcel_members (parcel_id, user_id, role) VALUES ($1, $2, 'proprietaire')`,
      [id, ownerId]
    );
    // Une parcelle a toujours une ligne de commandes : évite un cas nul
    // partout ailleurs dans le code.
    await client.query(`INSERT INTO irrigation_commands (parcel_id) VALUES ($1)`, [id]);
    await client.query("COMMIT");
    return rowToParcel(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listParcelsForUser(userId: string): Promise<ParcelWithRole[]> {
  const { rows } = await pool.query(
    `SELECT p.*, m.role FROM parcels p
     JOIN parcel_members m ON m.parcel_id = p.id
     WHERE m.user_id = $1
     ORDER BY p.created_at`,
    [userId]
  );
  return rows.map((r) => ({ ...rowToParcel(r), role: r.role as Role }));
}

export async function getParcel(parcelId: string): Promise<ParcelInfo | null> {
  const { rows } = await pool.query(`SELECT * FROM parcels WHERE id = $1`, [parcelId]);
  return rows[0] ? rowToParcel(rows[0]) : null;
}

export async function updateParcel(parcelId: string, update: Partial<ParcelInfo>): Promise<ParcelInfo | null> {
  const { rows } = await pool.query(
    `UPDATE parcels SET
       nom = COALESCE($2, nom),
       culture = COALESCE($3, culture),
       date_plantation = COALESCE($4, date_plantation),
       latitude = COALESCE($5, latitude),
       longitude = COALESCE($6, longitude)
     WHERE id = $1 RETURNING *`,
    [
      parcelId,
      update.nom ?? null,
      update.culture ?? null,
      update.datePlantation ?? null,
      update.latitude ?? null,
      update.longitude ?? null,
    ]
  );
  return rows[0] ? rowToParcel(rows[0]) : null;
}

/** Rôle de l'utilisateur sur la parcelle, ou null s'il n'y a pas accès. */
export async function getMemberRole(parcelId: string, userId: string): Promise<Role | null> {
  const { rows } = await pool.query(
    `SELECT role FROM parcel_members WHERE parcel_id = $1 AND user_id = $2`,
    [parcelId, userId]
  );
  return rows[0]?.role ?? null;
}

export async function listMembers(parcelId: string) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nom, u.telephone, m.role
     FROM parcel_members m JOIN users u ON u.id = m.user_id
     WHERE m.parcel_id = $1 ORDER BY m.created_at`,
    [parcelId]
  );
  return rows.map((r) => ({ id: r.id, nom: r.nom, telephone: r.telephone, role: r.role as Role }));
}

export async function addMember(parcelId: string, userId: string, role: Role): Promise<void> {
  await pool.query(
    `INSERT INTO parcel_members (parcel_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (parcel_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [parcelId, userId, role]
  );
}

export async function removeMember(parcelId: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM parcel_members WHERE parcel_id = $1 AND user_id = $2`, [parcelId, userId]);
}

// --- Boîtiers ----------------------------------------------------------

const hashKey = (secret: string) => crypto.createHash("sha256").update(secret).digest("hex");

/**
 * Crée un boîtier et renvoie sa clé complète — la seule fois où elle est
 * lisible. Format "<id>.<secret>" : le préfixe évite de comparer le hash
 * de tous les boîtiers à chaque requête du firmware.
 */
export async function createDevice(parcelId: string, nom?: string): Promise<{ device: DeviceInfo; key: string }> {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(24).toString("base64url");
  const { rows } = await pool.query(
    `INSERT INTO devices (id, parcel_id, nom, key_hash) VALUES ($1, $2, COALESCE($3,'Boîtier RX35'), $4) RETURNING *`,
    [id, parcelId, nom ?? null, hashKey(secret)]
  );
  return {
    device: { id: rows[0].id, parcelId: rows[0].parcel_id, nom: rows[0].nom, lastSeenAt: null },
    key: `${id}.${secret}`,
  };
}

export async function listDevices(parcelId: string): Promise<DeviceInfo[]> {
  const { rows } = await pool.query(
    `SELECT * FROM devices WHERE parcel_id = $1 ORDER BY created_at`,
    [parcelId]
  );
  return rows.map((r) => ({
    id: r.id,
    parcelId: r.parcel_id,
    nom: r.nom,
    lastSeenAt: r.last_seen_at ? toEpoch(r.last_seen_at) : null,
  }));
}

export async function deleteDevice(deviceId: string, parcelId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM devices WHERE id = $1 AND parcel_id = $2`, [deviceId, parcelId]);
  return (rowCount ?? 0) > 0;
}

/** Authentifie un boîtier à partir de la clé "<id>.<secret>". */
export async function authenticateDevice(rawKey: string): Promise<DeviceInfo | null> {
  const sep = rawKey.indexOf(".");
  if (sep <= 0) return null;
  const id = rawKey.slice(0, sep);
  const secret = rawKey.slice(sep + 1);
  // Un id malformé ferait échouer la requête (type UUID) : on filtre avant.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { rows } = await pool.query(`SELECT * FROM devices WHERE id = $1`, [id]);
  if (!rows[0]) return null;

  const attendu = Buffer.from(rows[0].key_hash, "utf8");
  const fourni = Buffer.from(hashKey(secret), "utf8");
  if (attendu.length !== fourni.length || !crypto.timingSafeEqual(attendu, fourni)) return null;

  await pool.query(`UPDATE devices SET last_seen_at = now() WHERE id = $1`, [id]);
  return { id: rows[0].id, parcelId: rows[0].parcel_id, nom: rows[0].nom, lastSeenAt: Date.now() / 1000 };
}

// --- Relevés capteurs --------------------------------------------------

function rowToSnapshot(r: any): SensorSnapshot {
  return {
    timestamp: toEpoch(r.recorded_at),
    temperatureC: Number(r.temperature_c),
    humidityAirPct: Number(r.humidity_air_pct),
    pressureHpa: Number(r.pressure_hpa),
    lux: Number(r.lux),
    soilMoisturePct: Number(r.soil_moisture_pct),
    soilPh: Number(r.soil_ph),
    waterLevelPct: Number(r.water_level_pct),
    flowLpm: Number(r.flow_lpm),
    flowTotalL: Number(r.flow_total_l),
    batteryPct: Number(r.battery_pct),
    motion: !!r.motion,
    simule: !!r.simule,
  };
}

export async function addSensorSnapshot(parcelId: string, s: SensorSnapshot): Promise<void> {
  await pool.query(
    `INSERT INTO sensor_readings
       (id, parcel_id, recorded_at, temperature_c, humidity_air_pct, pressure_hpa, lux,
        soil_moisture_pct, soil_ph, water_level_pct, flow_lpm, flow_total_l, battery_pct, motion, simule)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      crypto.randomUUID(), parcelId, fromEpoch(s.timestamp),
      s.temperatureC, s.humidityAirPct, s.pressureHpa, s.lux,
      s.soilMoisturePct, s.soilPh, s.waterLevelPct, s.flowLpm, s.flowTotalL, s.batteryPct, s.motion,
      s.simule ?? false,
    ]
  );
}

export async function getLatestSensorSnapshot(parcelId: string): Promise<SensorSnapshot | null> {
  const { rows } = await pool.query(
    `SELECT * FROM sensor_readings WHERE parcel_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [parcelId]
  );
  return rows[0] ? rowToSnapshot(rows[0]) : null;
}

export async function getSensorHistory(parcelId: string, sinceEpoch: number): Promise<SensorSnapshot[]> {
  const { rows } = await pool.query(
    `SELECT * FROM sensor_readings WHERE parcel_id = $1 AND recorded_at >= $2 ORDER BY recorded_at`,
    [parcelId, fromEpoch(sinceEpoch)]
  );
  return rows.map(rowToSnapshot);
}

// --- Sonde NPK ---------------------------------------------------------

export async function addNpkSnapshot(parcelId: string, s: NpkSnapshot): Promise<void> {
  await pool.query(
    `INSERT INTO npk_readings (id, parcel_id, recorded_at, nitrogen_mg_kg, phosphorus_mg_kg, potassium_mg_kg, conductivity_us_cm)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), parcelId, fromEpoch(s.timestamp), s.nitrogenMgKg, s.phosphorusMgKg, s.potassiumMgKg, s.conductivityUsCm]
  );
}

export async function getLatestNpkSnapshot(parcelId: string): Promise<NpkSnapshot | null> {
  const { rows } = await pool.query(
    `SELECT * FROM npk_readings WHERE parcel_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [parcelId]
  );
  const r = rows[0];
  return r
    ? {
        timestamp: toEpoch(r.recorded_at),
        nitrogenMgKg: Number(r.nitrogen_mg_kg),
        phosphorusMgKg: Number(r.phosphorus_mg_kg),
        potassiumMgKg: Number(r.potassium_mg_kg),
        conductivityUsCm: Number(r.conductivity_us_cm),
      }
    : null;
}

// --- Alertes -----------------------------------------------------------

export async function addAlert(
  parcelId: string,
  alert: { type: AlertItem["type"]; message: string; timestamp?: number }
): Promise<AlertItem> {
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO alerts (id, parcel_id, occurred_at, type, message) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, parcelId, fromEpoch(alert.timestamp), alert.type, alert.message]
  );
  return { id, timestamp: toEpoch(rows[0].occurred_at), type: rows[0].type, message: rows[0].message, lu: false };
}

export async function getAlerts(parcelId: string, userId: string): Promise<AlertItem[]> {
  const { rows } = await pool.query(
    `SELECT a.*, (r.user_id IS NOT NULL) AS lu
     FROM alerts a
     LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = $2
     WHERE a.parcel_id = $1
     ORDER BY a.occurred_at DESC`,
    [parcelId, userId]
  );
  return rows.map((r) => ({
    id: r.id,
    timestamp: toEpoch(r.occurred_at),
    type: r.type,
    message: r.message,
    lu: r.lu,
  }));
}

export async function markAlertRead(alertId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO alert_reads (alert_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [alertId, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function getUnreadAlertCount(parcelId: string, userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM alerts a
     LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = $2
     WHERE a.parcel_id = $1 AND r.user_id IS NULL`,
    [parcelId, userId]
  );
  return rows[0]?.n ?? 0;
}

// --- Conversation avec l'assistant ------------------------------------

export async function getChatHistory(parcelId: string, userId: string): Promise<ChatMessage[]> {
  const { rows } = await pool.query(
    `SELECT * FROM chat_messages WHERE parcel_id = $1 AND user_id = $2 ORDER BY created_at LIMIT 200`,
    [parcelId, userId]
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    text: r.text,
    imageUri: r.image_uri ?? undefined,
    timestamp: toEpoch(r.created_at),
  }));
}

export async function addChatMessage(parcelId: string, userId: string, msg: ChatMessage): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (id, parcel_id, user_id, role, text, image_uri, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [msg.id, parcelId, userId, msg.role, msg.text, msg.imageUri ?? null, fromEpoch(msg.timestamp)]
  );
}

// --- Photos ------------------------------------------------------------

export async function addPhoto(parcelId: string, photo: PhotoItem): Promise<void> {
  await pool.query(
    `INSERT INTO photos (id, parcel_id, captured_at, uri, type) VALUES ($1,$2,$3,$4,$5)`,
    [photo.id, parcelId, fromEpoch(photo.timestamp), photo.uri, photo.type]
  );
}

export async function getPhotos(parcelId: string): Promise<PhotoItem[]> {
  const { rows } = await pool.query(
    `SELECT * FROM photos WHERE parcel_id = $1 ORDER BY captured_at DESC LIMIT 500`,
    [parcelId]
  );
  return rows.map((r) => ({ id: r.id, timestamp: toEpoch(r.captured_at), uri: r.uri, type: r.type }));
}

export async function getPhotoNear(
  parcelId: string,
  timestamp: number,
  toleranceSeconds = 1800
): Promise<PhotoItem | null> {
  const { rows } = await pool.query(
    `SELECT * FROM photos
     WHERE parcel_id = $1 AND abs(extract(epoch FROM captured_at) - $2) <= $3
     ORDER BY abs(extract(epoch FROM captured_at) - $2) LIMIT 1`,
    [parcelId, timestamp, toleranceSeconds]
  );
  return rows[0]
    ? { id: rows[0].id, timestamp: toEpoch(rows[0].captured_at), uri: rows[0].uri, type: rows[0].type }
    : null;
}

// --- Commandes d'irrigation -------------------------------------------

export async function getCommands(parcelId: string): Promise<DeviceCommands> {
  const { rows } = await pool.query(`SELECT * FROM irrigation_commands WHERE parcel_id = $1`, [parcelId]);
  const r = rows[0];
  return { irrigationMode: r?.irrigation_mode ?? "auto", pumpManualOn: r?.pump_manual_on ?? false };
}

export async function setIrrigationMode(
  parcelId: string,
  mode: "auto" | "manuel",
  userId: string
): Promise<DeviceCommands> {
  const { rows } = await pool.query(
    `INSERT INTO irrigation_commands (parcel_id, irrigation_mode, updated_by)
     VALUES ($1,$2,$3)
     ON CONFLICT (parcel_id) DO UPDATE SET irrigation_mode = EXCLUDED.irrigation_mode,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [parcelId, mode, userId]
  );
  return { irrigationMode: rows[0].irrigation_mode, pumpManualOn: rows[0].pump_manual_on };
}

export async function setPumpManual(parcelId: string, on: boolean, userId: string): Promise<DeviceCommands> {
  const { rows } = await pool.query(
    `INSERT INTO irrigation_commands (parcel_id, pump_manual_on, updated_by)
     VALUES ($1,$2,$3)
     ON CONFLICT (parcel_id) DO UPDATE SET pump_manual_on = EXCLUDED.pump_manual_on,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [parcelId, on, userId]
  );
  return { irrigationMode: rows[0].irrigation_mode, pumpManualOn: rows[0].pump_manual_on };
}
