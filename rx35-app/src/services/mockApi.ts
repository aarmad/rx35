// ============================================================
// Couche d'accès aux données — pour l'instant simulée en local.
//
// TOUT passe par ce fichier : chaque écran appelle ces fonctions plutôt que
// de générer ses propres données. Quand le backend RX35 sera prêt, seul ce
// fichier doit changer (remplacer chaque fonction par un vrai appel HTTP /
// WebSocket vers l'API), sans toucher aux écrans.
// ============================================================
import {
  AlertItem,
  ChatMessage,
  Culture,
  NdviSnapshot,
  NpkSnapshot,
  ParcelInfo,
  PhotoItem,
  SensorSnapshot,
  WeatherDay,
} from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- État simulé en mémoire (remplacera les appels réseau plus tard) ---
let parcel: ParcelInfo = {
  nom: "Parcelle 1 — Lomé Nord",
  culture: "tomate",
  datePlantation: "2026-07-20",
  latitude: 6.1725,
  longitude: 1.2314,
};

let irrigationMode: "auto" | "manuel" = "auto";
let pumpManualOn = false;

let alerts: AlertItem[] = [
  { id: "a1", timestamp: Date.now() / 1000 - 3600, type: "mouvement", message: "Mouvement détecté près de l'entrée de la parcelle", lu: false },
  { id: "a2", timestamp: Date.now() / 1000 - 7200 * 3, type: "info", message: "Irrigation automatique déclenchée (humidité sous le seuil)", lu: true },
  { id: "a3", timestamp: Date.now() / 1000 - 86400, type: "niveau_eau", message: "Niveau du réservoir passé sous 20%", lu: true },
];

const chatHistory: ChatMessage[] = [
  {
    id: "c0",
    role: "assistant",
    text: "Bonjour ! Je suis l'assistant RX35. Demandez-moi l'état de votre parcelle, l'historique récent, ou pourquoi une action a été déclenchée.",
    timestamp: Date.now() / 1000,
  },
];

// --- Génération de valeurs simulées mais réalistes ---
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export async function getLatestSensorSnapshot(): Promise<SensorSnapshot> {
  await wait(200);
  const now = Date.now() / 1000;
  const hourOfDay = new Date().getHours();
  const isDaytime = hourOfDay > 6 && hourOfDay < 18;
  return {
    timestamp: now,
    temperatureC: 26 + seededRandom(now) * 6,
    humidityAirPct: 55 + seededRandom(now + 1) * 20,
    pressureHpa: 1010 + seededRandom(now + 2) * 4,
    lux: isDaytime ? 8000 + seededRandom(now + 3) * 40000 : 5 + seededRandom(now + 3) * 15,
    soilMoisturePct: 42 + seededRandom(now + 4) * 25,
    soilPh: 6.2 + seededRandom(now + 5) * 1.2,
    waterLevelPct: 68 + seededRandom(now + 6) * 20,
    flowLpm: irrigationMode === "manuel" && pumpManualOn ? 8.2 : 0,
    flowTotalL: 1240 + seededRandom(now + 7) * 5,
    batteryPct: 78 + seededRandom(now + 8) * 15,
    motion: seededRandom(now + 9) > 0.9,
  };
}

export async function getSensorHistory(periodDays: 1 | 7 | 30): Promise<SensorSnapshot[]> {
  await wait(300);
  const points = periodDays === 1 ? 24 : periodDays === 7 ? 28 : 30;
  const now = Date.now() / 1000;
  const stepSeconds = (periodDays * 86400) / points;
  const out: SensorSnapshot[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const t = now - i * stepSeconds;
    const seed = t / 1000;
    out.push({
      timestamp: t,
      temperatureC: 25 + Math.sin(seed) * 5 + seededRandom(seed) * 2,
      humidityAirPct: 60 + Math.cos(seed) * 15,
      pressureHpa: 1012,
      lux: 15000 + Math.sin(seed) * 15000,
      soilMoisturePct: 50 + Math.sin(seed / 2) * 20,
      soilPh: 6.5 + Math.sin(seed / 5) * 0.5,
      waterLevelPct: 70 - (i % 10) * 2,
      flowLpm: 0,
      flowTotalL: 1200 + i * 3,
      batteryPct: 85,
      motion: false,
    });
  }
  return out;
}

export async function getNpkLatest(): Promise<NpkSnapshot> {
  await wait(200);
  const now = Date.now() / 1000;
  return {
    timestamp: now,
    nitrogenMgKg: 38 + seededRandom(now) * 20,
    phosphorusMgKg: 22 + seededRandom(now + 1) * 12,
    potassiumMgKg: 145 + seededRandom(now + 2) * 40,
    conductivityUsCm: 320 + seededRandom(now + 3) * 80,
  };
}

export async function getParcelInfo(): Promise<ParcelInfo> {
  await wait(100);
  return parcel;
}

export async function saveParcelInfo(update: Partial<ParcelInfo>): Promise<ParcelInfo> {
  await wait(200);
  parcel = { ...parcel, ...update };
  return parcel;
}

export async function getIrrigationMode(): Promise<"auto" | "manuel"> {
  await wait(80);
  return irrigationMode;
}

export async function setIrrigationMode(mode: "auto" | "manuel"): Promise<void> {
  await wait(150);
  irrigationMode = mode;
}

export async function setPumpManual(on: boolean): Promise<boolean> {
  await wait(150);
  pumpManualOn = on;
  return pumpManualOn;
}

export async function getWeather(): Promise<WeatherDay[]> {
  await wait(250);
  const days: WeatherDay[] = [];
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const seed = d.getTime() / 100000;
    const pluie = seededRandom(seed) > 0.7 ? seededRandom(seed + 1) * 18 : 0;
    days.push({
      date: d.toISOString().slice(0, 10),
      tempMinC: 21 + seededRandom(seed + 2) * 3,
      tempMaxC: 29 + seededRandom(seed + 3) * 4,
      pluieMm: Math.round(pluie),
      pluiePrevue: pluie > 2,
    });
  }
  return days;
}

export async function getAlerts(): Promise<AlertItem[]> {
  await wait(150);
  return [...alerts].sort((a, b) => b.timestamp - a.timestamp);
}

export async function markAlertRead(id: string): Promise<void> {
  await wait(80);
  alerts = alerts.map((a) => (a.id === id ? { ...a, lu: true } : a));
}

export async function getUnreadAlertCount(): Promise<number> {
  await wait(50);
  return alerts.filter((a) => !a.lu).length;
}

// --- Carte satellite (NDVI) ---
// TODO backend : remplacer par un appel à l'API interne qui interroge
// Sentinel Hub / Copernicus sur les coordonnées GPS de la parcelle
// (voir cahier de présentation, §8 "Service cartographie satellite").
export async function getAvailableNdviDates(): Promise<string[]> {
  await wait(150);
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i * 4);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export async function getNdviSnapshot(date: string): Promise<NdviSnapshot> {
  await wait(300);
  const grid = [];
  const seed = new Date(date).getTime() / 100000;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      const v = seededRandom(seed + row * 8 + col);
      const zone = (Math.min(5, Math.max(1, Math.ceil(v * 5))) as 1 | 2 | 3 | 4 | 5);
      grid.push({ zone, row, col });
    }
  }
  return { date, grid, source: "simule" };
}

// --- Assistant IA ---
// TODO backend : remplacer par un appel à l'API du backend RX35, qui
// interrogera Claude avec le contexte de la parcelle (voir cahier §11).
export async function getChatHistory(): Promise<ChatMessage[]> {
  await wait(100);
  return chatHistory;
}

export async function sendChatMessage(text: string): Promise<ChatMessage> {
  const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: "user", text, timestamp: Date.now() / 1000 };
  chatHistory.push(userMsg);
  await wait(500);

  const snapshot = await getLatestSensorSnapshot();
  const lower = text.toLowerCase();
  let reply =
    "Je note votre question — une fois connecté au backend, je pourrai analyser l'historique complet pour vous répondre précisément.";
  if (lower.includes("humid") || lower.includes("arros") || lower.includes("irrig")) {
    reply = `L'humidité du sol est actuellement à ${snapshot.soilMoisturePct.toFixed(
      0
    )} %. ${
      irrigationMode === "auto"
        ? "L'irrigation automatique ajustera la pompe selon le seuil de la culture en cours."
        : "Le mode manuel est actif : vous contrôlez la pompe depuis l'écran Accueil."
    }`;
  } else if (lower.includes("temp")) {
    reply = `Température actuelle : ${snapshot.temperatureC.toFixed(1)} °C.`;
  } else if (lower.includes("eau") || lower.includes("réservoir") || lower.includes("reservoir")) {
    reply = `Le réservoir est à ${snapshot.waterLevelPct.toFixed(0)} % de sa capacité.`;
  } else if (lower.includes("batter")) {
    reply = `Batterie estimée à ${snapshot.batteryPct.toFixed(0)} %.`;
  }

  const assistantMsg: ChatMessage = {
    id: `a_${Date.now()}`,
    role: "assistant",
    text: reply,
    timestamp: Date.now() / 1000,
  };
  chatHistory.push(assistantMsg);
  return assistantMsg;
}

// Diagnostic par photo — l'agriculteur joint une image depuis l'Assistant IA
// (caméra ou galerie du téléphone), voir cahier §11 "Diagnostic des cultures
// par photo". TODO backend : envoyer l'image à l'API RX35 pour analyse réelle.
export async function sendChatPhoto(imageUri: string): Promise<{ userMsg: ChatMessage; assistantMsg: ChatMessage }> {
  const userMsg: ChatMessage = {
    id: `u_${Date.now()}`,
    role: "user",
    text: "Photo envoyée pour diagnostic",
    imageUri,
    timestamp: Date.now() / 1000,
  };
  chatHistory.push(userMsg);
  await wait(900);

  const diagnostics = [
    "Aucune anomalie visible sur cette photo — le feuillage semble sain.",
    "Je repère un léger jaunissement sur les feuilles basses, possiblement lié à une carence en azote. Je vous recommande de vérifier les valeurs NPK.",
    "Quelques taches brunes visibles — cela peut être un début de mildiou. Surveillez l'humidité ambiante et pensez à contacter un agronome RX Stack si ça s'étend.",
  ];
  const reply = diagnostics[Math.floor(seededRandom(Date.now()) * diagnostics.length)];

  const assistantMsg: ChatMessage = {
    id: `a_${Date.now()}`,
    role: "assistant",
    text: `${reply} Un agronome RX Stack peut compléter ce diagnostic si besoin — l'IA assiste, elle ne remplace pas l'avis humain.`,
    timestamp: Date.now() / 1000,
  };
  chatHistory.push(assistantMsg);
  return { userMsg, assistantMsg };
}

// --- Galerie photo (captures automatiques du boîtier) ---
// TODO backend : remplacer par les images réellement envoyées par
// l'ESP32-CAM (capture périodique 3h + capture sur mouvement, voir
// rx35-firmware-cam et cahier §8).
let photosCache: PhotoItem[] | null = null;

export async function getPhotos(): Promise<PhotoItem[]> {
  await wait(200);
  if (!photosCache) {
    const now = Date.now() / 1000;
    photosCache = Array.from({ length: 12 }).map((_, i) => {
      const t = now - i * 3 * 3600;
      const isMotion = i % 4 === 0;
      return {
        id: `p${i}`,
        timestamp: t,
        uri: `https://picsum.photos/seed/rx35-${i}/300/300`,
        type: isMotion ? "mouvement" : "periodique",
      } as PhotoItem;
    });
  }
  return photosCache;
}

// Retourne la photo la plus proche d'un horodatage donné (utile pour relier
// un événement de l'historique à l'image prise au même moment).
export async function getPhotoNear(timestamp: number, toleranceSeconds = 1800): Promise<PhotoItem | null> {
  const photos = await getPhotos();
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

export async function getSecurityState(): Promise<"ARME" | "DESARME" | "ALARME"> {
  await wait(100);
  return "ARME";
}

export async function getGrowthStage(culture: Culture, datePlantation: string): Promise<string> {
  const jours = Math.max(0, Math.floor((Date.now() - new Date(datePlantation).getTime()) / 86400000));
  const cycles: Record<Culture, { levee: number; croissance: number }> = {
    tomate: { levee: 20, croissance: 60 },
    mais: { levee: 25, croissance: 90 },
    riz: { levee: 25, croissance: 90 },
    piment: { levee: 25, croissance: 70 },
    oignon: { levee: 20, croissance: 80 },
  };
  const c = cycles[culture];
  if (jours <= c.levee) return `Levée (jour ${jours})`;
  if (jours <= c.croissance) return `Croissance (jour ${jours})`;
  return `Maturation (jour ${jours})`;
}
