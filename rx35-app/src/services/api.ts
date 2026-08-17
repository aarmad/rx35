// ============================================================
// Client API réel — remplace mockApi.ts.
//
// Mêmes signatures de fonctions que mockApi.ts (même forme de données),
// donc aucun écran n'a eu à changer au-delà de l'import. mockApi.ts reste
// dans le projet comme mode démo hors-ligne (voir README) mais n'est plus
// utilisé par défaut.
// ============================================================
import { API_BASE_URL } from "./config";
import { getToken, setToken, notifyUnauthorized } from "./authStore";
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

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // fetch ne rejette que sur un échec réseau : backend éteint, mauvaise
    // adresse dans .env, téléphone sur un autre réseau que l'ordinateur.
    // Le message par défaut ("Network request failed") n'aide pas à
    // diagnostiquer ça sur le terrain, donc on le remplace.
    throw new Error(`Serveur RX35 injoignable (${API_BASE_URL}). Vérifiez que le backend tourne et que le téléphone est sur le même réseau Wi-Fi.`);
  }

  if (!res.ok) {
    // Session expirée ou invalidée côté serveur : on nettoie le token et on
    // prévient AuthContext, sinon l'utilisateur reste sur des écrans qui
    // échoueront à chaque requête sans jamais lui proposer de se reconnecter.
    if (res.status === 401 && token) {
      await setToken(null);
      notifyUnauthorized();
    }

    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // corps non-JSON, on garde le message générique
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Résout une URI d'image renvoyée par le backend (chemin relatif) en URL
// absolue exploitable par <Image source={{uri}}>.
function resolvePhotoUri(uri: string): string {
  if (uri.startsWith("http") || uri.startsWith("data:")) return uri;
  return `${API_BASE_URL}${uri}`;
}

export interface AuthUser {
  id: string;
  nom: string;
  telephone: string;
}

export async function apiRegister(nom: string, telephone: string, password: string): Promise<AuthUser> {
  const r = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ nom, telephone, password }),
  });
  await setToken(r.token);
  return r.user;
}

export async function apiLogin(telephone: string, password: string): Promise<AuthUser> {
  const r = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ telephone, password }),
  });
  await setToken(r.token);
  return r.user;
}

export async function apiLogout(): Promise<void> {
  await setToken(null);
}

export async function getMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me");
}

export async function updateMe(update: Partial<Pick<AuthUser, "nom" | "telephone">>): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me", { method: "PUT", body: JSON.stringify(update) });
}

export async function getLatestSensorSnapshot(): Promise<SensorSnapshot> {
  return apiFetch<SensorSnapshot>("/api/sensors/latest");
}

export async function getSensorHistory(periodDays: 1 | 7 | 30): Promise<SensorSnapshot[]> {
  return apiFetch<SensorSnapshot[]>(`/api/sensors/history?period=${periodDays}`);
}

export async function getNpkLatest(): Promise<NpkSnapshot> {
  return apiFetch<NpkSnapshot>("/api/npk/latest");
}

export async function getParcelInfo(): Promise<ParcelInfo> {
  return apiFetch<ParcelInfo>("/api/parcel");
}

export async function saveParcelInfo(update: Partial<ParcelInfo>): Promise<ParcelInfo> {
  return apiFetch<ParcelInfo>("/api/parcel", { method: "PUT", body: JSON.stringify(update) });
}

export async function getIrrigationMode(): Promise<"auto" | "manuel"> {
  const r = await apiFetch<{ mode: "auto" | "manuel" }>("/api/irrigation/mode");
  return r.mode;
}

// Mode ET état de la pompe : relus ensemble à l'ouverture de l'accueil pour
// que le bouton reflète ce que le boîtier va réellement faire.
export async function getIrrigationState(): Promise<{ mode: "auto" | "manuel"; pumpManualOn: boolean }> {
  return apiFetch<{ mode: "auto" | "manuel"; pumpManualOn: boolean }>("/api/irrigation/state");
}

export async function setIrrigationMode(mode: "auto" | "manuel"): Promise<void> {
  await apiFetch("/api/irrigation/mode", { method: "PUT", body: JSON.stringify({ mode }) });
}

export async function setPumpManual(on: boolean): Promise<boolean> {
  const r = await apiFetch<{ pumpManualOn: boolean }>("/api/irrigation/pump", {
    method: "PUT",
    body: JSON.stringify({ on }),
  });
  return r.pumpManualOn;
}

export async function getWeather(): Promise<WeatherDay[]> {
  return apiFetch<WeatherDay[]>("/api/weather");
}

export async function getAlerts(): Promise<AlertItem[]> {
  return apiFetch<AlertItem[]>("/api/alerts");
}

export async function markAlertRead(id: string): Promise<void> {
  await apiFetch(`/api/alerts/${id}/read`, { method: "PUT" });
}

export async function getUnreadAlertCount(): Promise<number> {
  const r = await apiFetch<{ count: number }>("/api/alerts/unread-count");
  return r.count;
}

export async function getAvailableNdviDates(): Promise<string[]> {
  return apiFetch<string[]>("/api/satellite/dates");
}

export async function getNdviSnapshot(date: string): Promise<NdviSnapshot> {
  // `source` indique si la grille vient réellement de Sentinel-2 ou du repli
  // simulé du backend (identifiants Copernicus absents, scène trop nuageuse) —
  // l'écran Carte l'affiche pour ne pas faire passer une simulation pour une
  // mesure satellite.
  return apiFetch<NdviSnapshot>(`/api/satellite/ndvi?date=${encodeURIComponent(date)}`);
}

export async function getChatHistory(): Promise<ChatMessage[]> {
  const history = await apiFetch<ChatMessage[]>("/api/assistant/history");
  return history.map((m) => (m.imageUri ? { ...m, imageUri: resolvePhotoUri(m.imageUri) } : m));
}

export async function sendChatMessage(text: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>("/api/assistant/message", { method: "POST", body: JSON.stringify({ text }) });
}

export async function sendChatPhoto(imageUri: string): Promise<{ userMsg: ChatMessage; assistantMsg: ChatMessage }> {
  const form = new FormData();
  form.append("photo", { uri: imageUri, name: "photo.jpg", type: "image/jpeg" } as any);

  const assistantMsg = await apiFetch<ChatMessage>("/api/assistant/photo", { method: "POST", body: form });
  // Le backend enregistre aussi le message utilisateur ; on le relit pour
  // rester cohérent avec l'historique côté serveur plutôt que d'en
  // reconstruire un approximatif ici.
  const history = await getChatHistory();
  const userMsg = history[history.length - 2] ?? history[history.length - 1];
  return { userMsg, assistantMsg };
}

export async function getPhotos(): Promise<PhotoItem[]> {
  const photos = await apiFetch<PhotoItem[]>("/api/photos");
  return photos.map((p) => ({ ...p, uri: resolvePhotoUri(p.uri) }));
}

export async function getPhotoNear(timestamp: number, toleranceSeconds = 1800): Promise<PhotoItem | null> {
  try {
    const p = await apiFetch<PhotoItem>(`/api/photos/near?timestamp=${Math.floor(timestamp)}&tolerance=${toleranceSeconds}`);
    return { ...p, uri: resolvePhotoUri(p.uri) };
  } catch {
    return null; // 404 attendu si aucune photo proche — pas une erreur à remonter
  }
}

// Pas encore d'endpoint backend dédié à l'état de sécurité en temps réel
// (le boîtier gère sa machine à états localement, voir access_control.cpp
// côté firmware) — calcul purement indicatif en attendant la synchronisation.
export async function getSecurityState(): Promise<"ARME" | "DESARME" | "ALARME"> {
  return "ARME";
}

// Calcul purement local, ne dépend d'aucune donnée serveur — inchangé par
// rapport à mockApi.ts.
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
