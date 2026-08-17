-- ============================================================
-- Schéma RX35.
--
-- Modèle : une PARCELLE est l'unité centrale. Un utilisateur accède à une
-- parcelle via une adhésion (parcel_members) portant un rôle. Cela couvre
-- les trois cas d'usage avec une seule structure :
--   - exploitant seul      : 1 parcelle, 1 membre (proprietaire)
--   - plusieurs parcelles  : N parcelles, le même membre sur chacune
--   - coopérative          : 1 parcelle, N membres de rôles différents
--
-- Tout ce qui était global dans l'ancien db.json (relevés, alertes,
-- commandes d'irrigation, conversation IA, photos) est désormais rattaché
-- à une parcelle : deux agriculteurs ne peuvent plus se voir ni, surtout,
-- piloter la pompe l'un de l'autre.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  nom           TEXT NOT NULL,
  telephone     TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parcels (
  id              UUID PRIMARY KEY,
  nom             TEXT NOT NULL,
  culture         TEXT NOT NULL DEFAULT 'tomate',
  date_plantation DATE NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL DEFAULT 6.1725,
  longitude       DOUBLE PRECISION NOT NULL DEFAULT 1.2314,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rôles : proprietaire (tous droits, dont supprimer et inviter),
-- membre (consulte et pilote l'irrigation), observateur (consulte seulement).
CREATE TABLE IF NOT EXISTS parcel_members (
  parcel_id  UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'membre'
             CHECK (role IN ('proprietaire', 'membre', 'observateur')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parcel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON parcel_members(user_id);

-- Un boîtier appartient à une parcelle. Sa clé est stockée hashée : une
-- fuite de la base ne permet pas d'usurper un boîtier. La clé complète
-- n'est affichée qu'une seule fois, à la création, pour être recopiée dans
-- la configuration du firmware.
--
-- Format de la clé envoyée par le boîtier : "<id du boîtier>.<secret>".
-- Le préfixe permet de retrouver la ligne sans comparer le hash de tous
-- les boîtiers de la base.
CREATE TABLE IF NOT EXISTS devices (
  id           UUID PRIMARY KEY,
  parcel_id    UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL DEFAULT 'Boîtier RX35',
  key_hash     TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devices_parcel ON devices(parcel_id);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id                UUID PRIMARY KEY,
  parcel_id         UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  recorded_at       TIMESTAMPTZ NOT NULL,
  temperature_c     DOUBLE PRECISION,
  humidity_air_pct  DOUBLE PRECISION,
  pressure_hpa      DOUBLE PRECISION,
  lux               DOUBLE PRECISION,
  soil_moisture_pct DOUBLE PRECISION,
  soil_ph           DOUBLE PRECISION,
  water_level_pct   DOUBLE PRECISION,
  flow_lpm          DOUBLE PRECISION,
  flow_total_l      DOUBLE PRECISION,
  battery_pct       DOUBLE PRECISION,
  motion            BOOLEAN NOT NULL DEFAULT false
);
-- Index descendant : "dernier relevé" et "historique récent" sont les deux
-- requêtes chaudes de l'application.
CREATE INDEX IF NOT EXISTS idx_readings_parcel_time
  ON sensor_readings(parcel_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS npk_readings (
  id                 UUID PRIMARY KEY,
  parcel_id          UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  recorded_at        TIMESTAMPTZ NOT NULL,
  nitrogen_mg_kg     DOUBLE PRECISION,
  phosphorus_mg_kg   DOUBLE PRECISION,
  potassium_mg_kg    DOUBLE PRECISION,
  conductivity_us_cm DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_npk_parcel_time
  ON npk_readings(parcel_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id          UUID PRIMARY KEY,
  parcel_id   UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  type        TEXT NOT NULL
              CHECK (type IN ('mouvement','niveau_eau','alarme','badge_refuse','info')),
  message     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_parcel_time
  ON alerts(parcel_id, occurred_at DESC);

-- La lecture d'une alerte est propre à chaque membre : dans une
-- coopérative, l'alerte lue par l'un reste non lue pour les autres.
CREATE TABLE IF NOT EXISTS alert_reads (
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, user_id)
);

-- Intention de pilotage, relue par le boîtier à chaque cycle. La sécurité
-- de niveau d'eau reste appliquée côté firmware.
CREATE TABLE IF NOT EXISTS irrigation_commands (
  parcel_id       UUID PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE,
  irrigation_mode TEXT NOT NULL DEFAULT 'auto' CHECK (irrigation_mode IN ('auto','manuel')),
  pump_manual_on  BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Conversation propre à chaque membre sur une parcelle donnée : le
-- technicien de la coopérative ne lit pas les questions de l'exploitant.
CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY,
  parcel_id  UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  text       TEXT NOT NULL,
  image_uri  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_parcel_user_time
  ON chat_messages(parcel_id, user_id, created_at);

CREATE TABLE IF NOT EXISTS photos (
  id          UUID PRIMARY KEY,
  parcel_id   UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  uri         TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('periodique','mouvement'))
);
CREATE INDEX IF NOT EXISTS idx_photos_parcel_time
  ON photos(parcel_id, captured_at DESC);
