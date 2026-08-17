// Types partagés par l'application. Reflètent volontairement les mêmes
// grandeurs que le firmware (voir rx35-firmware-main/src/sensors_*.h) pour
// qu'il n'y ait qu'un seul modèle de données à maintenir entre le boîtier
// et l'application, une fois le backend en place.

export type Culture = "tomate" | "mais" | "riz" | "piment" | "oignon";

export type IrrigationMode = "auto" | "manuel";

export type SecurityState = "ARME" | "DESARME" | "ALARME";

export interface SensorSnapshot {
  timestamp: number; // epoch unix (s)
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

export type Role = "proprietaire" | "membre" | "observateur";

export interface ParcelInfo {
  id: string;
  nom: string;
  culture: Culture;
  datePlantation: string; // ISO yyyy-mm-dd
  latitude: number;
  longitude: number;
}

export interface ParcelMember {
  id: string;
  nom: string;
  telephone: string;
  role: Role;
}

export interface DeviceInfo {
  id: string;
  parcelId: string;
  nom: string;
  lastSeenAt: number | null;
}

export interface AlertItem {
  id: string;
  timestamp: number;
  type: "mouvement" | "niveau_eau" | "alarme" | "badge_refuse" | "info";
  message: string;
  lu: boolean;
}

export interface WeatherDay {
  date: string;
  tempMinC: number;
  tempMaxC: number;
  pluieMm: number;
  pluiePrevue: boolean;
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

export interface NdviZone {
  zone: 1 | 2 | 3 | 4 | 5; // 1 = très bonne vigueur, 5 = stress marqué
  row: number;
  col: number;
}

export interface NdviSnapshot {
  date: string; // ISO yyyy-mm-dd
  grid: NdviZone[];
  // Renseigné par le backend : image Sentinel-2 réelle, ou repli simulé
  // (voir rx35-backend/src/services/satelliteService.ts).
  source: "sentinel-hub" | "simule";
}
