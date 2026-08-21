// ============================================================
// Client API RX35.
//
// Toutes les données appartiennent désormais à une PARCELLE : les routes
// passent par /api/parcels/:id/... et l'identifiant courant vient du
// ParcelContext (voir src/parcels/ParcelContext.tsx).
// ============================================================
import { API_BASE_URL } from "./config";
import { getToken, setToken, notifyUnauthorized } from "./authStore";
import {
  AlertItem,
  ChatMessage,
  Culture,
  DeviceInfo,
  NdviSnapshot,
  NpkSnapshot,
  ParcelInfo,
  ParcelMember,
  PhotoItem,
  Recommandation,
  Role,
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
    // fetch ne rejette que sur un échec réseau : serveur éteint, mauvaise
    // adresse, téléphone hors ligne.
    throw new Error(
      `Serveur RX35 injoignable (${API_BASE_URL}). Vérifiez votre connexion internet.`
    );
  }

  if (!res.ok) {
    // Session expirée ou invalidée : on nettoie et on prévient AuthContext,
    // sinon l'utilisateur reste sur des écrans qui échouent en boucle.
    if (res.status === 401 && token) {
      await setToken(null);
      notifyUnauthorized();
    }
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // corps non-JSON
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function resolvePhotoUri(uri: string): string {
  if (uri.startsWith("http") || uri.startsWith("data:")) return uri;
  return `${API_BASE_URL}${uri}`;
}

// --- Compte ------------------------------------------------------------

export interface AuthUser {
  id: string;
  nom: string;
  telephone: string;
  /** Optionnel : sert uniquement à récupérer un accès perdu. */
  email?: string | null;
}

export async function apiRegister(
  nom: string,
  telephone: string,
  password: string,
  nomParcelle?: string
): Promise<{ user: AuthUser; parcel: ParcelInfo }> {
  const r = await apiFetch<{ token: string; user: AuthUser; parcel: ParcelInfo }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ nom, telephone, password, nomParcelle }),
  });
  await setToken(r.token);
  return { user: r.user, parcel: r.parcel };
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

export async function updateMe(
  update: Partial<Pick<AuthUser, "nom" | "telephone" | "email">>
): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me", { method: "PUT", body: JSON.stringify(update) });
}

// --- Mot de passe oublié ----------------------------------------------

/** Le serveur répond toujours pareil : impossible de savoir si le numéro existe. */
export async function demanderCodeReinitialisation(telephone: string): Promise<string> {
  const r = await apiFetch<{ message: string }>("/api/auth/forgot", {
    method: "POST",
    body: JSON.stringify({ telephone }),
  });
  return r.message;
}

/** Réinitialise et connecte directement : l'agriculteur ne ressaisit rien. */
export async function reinitialiserMotDePasse(
  telephone: string,
  code: string,
  password: string
): Promise<AuthUser> {
  const r = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/reset", {
    method: "POST",
    body: JSON.stringify({ telephone, code, password }),
  });
  await setToken(r.token);
  return r.user;
}

// --- Parcelles ---------------------------------------------------------

export async function listParcels(): Promise<(ParcelInfo & { role: Role })[]> {
  return apiFetch("/api/parcels");
}

export async function createParcel(data: {
  nom: string;
  culture?: Culture;
  datePlantation?: string;
  latitude?: number;
  longitude?: number;
}): Promise<ParcelInfo & { role: Role }> {
  return apiFetch("/api/parcels", { method: "POST", body: JSON.stringify(data) });
}

export async function getParcelInfo(parcelId: string): Promise<ParcelInfo & { role: Role }> {
  return apiFetch(`/api/parcels/${parcelId}`);
}

export async function saveParcelInfo(parcelId: string, update: Partial<ParcelInfo>): Promise<ParcelInfo> {
  return apiFetch(`/api/parcels/${parcelId}`, { method: "PUT", body: JSON.stringify(update) });
}

// --- Membres (coopérative) --------------------------------------------

export async function listMembers(parcelId: string): Promise<ParcelMember[]> {
  return apiFetch(`/api/parcels/${parcelId}/members`);
}

export async function addMember(parcelId: string, telephone: string, role: Role): Promise<ParcelMember[]> {
  return apiFetch(`/api/parcels/${parcelId}/members`, {
    method: "POST",
    body: JSON.stringify({ telephone, role }),
  });
}

export async function removeMember(parcelId: string, userId: string): Promise<ParcelMember[]> {
  return apiFetch(`/api/parcels/${parcelId}/members/${userId}`, { method: "DELETE" });
}

// --- Boîtiers ----------------------------------------------------------

export async function listDevices(parcelId: string): Promise<DeviceInfo[]> {
  return apiFetch(`/api/parcels/${parcelId}/devices`);
}

/** La clé complète n'est renvoyée qu'à la création : à recopier aussitôt. */
export async function createDevice(parcelId: string, nom?: string): Promise<DeviceInfo & { key: string }> {
  return apiFetch(`/api/parcels/${parcelId}/devices`, { method: "POST", body: JSON.stringify({ nom }) });
}

export async function deleteDevice(parcelId: string, deviceId: string): Promise<void> {
  await apiFetch(`/api/parcels/${parcelId}/devices/${deviceId}`, { method: "DELETE" });
}

// --- Données de la parcelle -------------------------------------------

export async function getLatestSensorSnapshot(parcelId: string): Promise<SensorSnapshot> {
  return apiFetch(`/api/parcels/${parcelId}/sensors/latest`);
}

export async function getSensorHistory(parcelId: string, periodDays: 1 | 7 | 30): Promise<SensorSnapshot[]> {
  return apiFetch(`/api/parcels/${parcelId}/sensors/history?period=${periodDays}`);
}

export async function getNpkLatest(parcelId: string): Promise<NpkSnapshot> {
  return apiFetch(`/api/parcels/${parcelId}/npk/latest`);
}

export async function getIrrigationState(
  parcelId: string
): Promise<{ mode: "auto" | "manuel"; pumpManualOn: boolean }> {
  return apiFetch(`/api/parcels/${parcelId}/irrigation/state`);
}

export async function setIrrigationMode(parcelId: string, mode: "auto" | "manuel"): Promise<void> {
  await apiFetch(`/api/parcels/${parcelId}/irrigation/mode`, { method: "PUT", body: JSON.stringify({ mode }) });
}

export async function setPumpManual(parcelId: string, on: boolean): Promise<boolean> {
  const r = await apiFetch<{ pumpManualOn: boolean }>(`/api/parcels/${parcelId}/irrigation/pump`, {
    method: "PUT",
    body: JSON.stringify({ on }),
  });
  return r.pumpManualOn;
}

export async function getWeather(parcelId: string): Promise<WeatherDay[]> {
  return apiFetch(`/api/parcels/${parcelId}/weather`);
}

export async function getAlerts(parcelId: string): Promise<AlertItem[]> {
  return apiFetch(`/api/parcels/${parcelId}/alerts`);
}

export async function markAlertRead(parcelId: string, id: string): Promise<void> {
  await apiFetch(`/api/parcels/${parcelId}/alerts/${id}/read`, { method: "PUT" });
}

export async function getUnreadAlertCount(parcelId: string): Promise<number> {
  const r = await apiFetch<{ count: number }>(`/api/parcels/${parcelId}/alerts/unread-count`);
  return r.count;
}

export async function getAvailableNdviDates(parcelId: string): Promise<string[]> {
  return apiFetch(`/api/parcels/${parcelId}/satellite/dates`);
}

export async function getNdviSnapshot(parcelId: string, date: string): Promise<NdviSnapshot> {
  return apiFetch(`/api/parcels/${parcelId}/satellite/ndvi?date=${encodeURIComponent(date)}`);
}

export async function getChatHistory(parcelId: string): Promise<ChatMessage[]> {
  const history = await apiFetch<ChatMessage[]>(`/api/parcels/${parcelId}/assistant/history`);
  return history.map((m) => (m.imageUri ? { ...m, imageUri: resolvePhotoUri(m.imageUri) } : m));
}

export async function sendChatMessage(parcelId: string, text: string): Promise<ChatMessage> {
  return apiFetch(`/api/parcels/${parcelId}/assistant/message`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function sendChatPhoto(parcelId: string, imageUri: string): Promise<ChatMessage> {
  const form = new FormData();
  form.append("photo", { uri: imageUri, name: "photo.jpg", type: "image/jpeg" } as any);
  return apiFetch(`/api/parcels/${parcelId}/assistant/photo`, { method: "POST", body: form });
}

export async function getPhotos(parcelId: string): Promise<PhotoItem[]> {
  const photos = await apiFetch<PhotoItem[]>(`/api/parcels/${parcelId}/photos`);
  return photos.map((p) => ({ ...p, uri: resolvePhotoUri(p.uri) }));
}

export async function getPhotoNear(
  parcelId: string,
  timestamp: number,
  toleranceSeconds = 1800
): Promise<PhotoItem | null> {
  try {
    const p = await apiFetch<PhotoItem>(
      `/api/parcels/${parcelId}/photos/near?timestamp=${Math.floor(timestamp)}&tolerance=${toleranceSeconds}`
    );
    return { ...p, uri: resolvePhotoUri(p.uri) };
  } catch {
    return null; // 404 attendu si aucune photo proche
  }
}

// Calcul purement local, indépendant du serveur.
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

/**
 * L'envoi d'e-mails est-il configuré côté serveur ?
 * Sans SMTP, aucun code ne partira : mieux vaut le dire à l'agriculteur
 * avant qu'il attende un message qui n'arrivera jamais.
 */
export async function envoiEmailDisponible(): Promise<boolean> {
  const r = await apiFetch<{ email: boolean }>("/api/auth/reset-disponible");
  return r.email;
}

/**
 * Conseils agronomiques : croisement des relevés, de la tendance, de la
 * météo et des alertes. Calculé côté serveur par des règles explicites
 * (rx35-backend/src/services/agronomie.ts), pas par une IA — un conseil
 * d'irrigation doit être reproductible et justifié.
 */
export async function getRecommandations(parcelId: string): Promise<Recommandation[]> {
  return apiFetch<Recommandation[]>(`/api/parcels/${parcelId}/recommandations`);
}

/**
 * Injecte un relevé de TEST dans la parcelle (propriétaire seulement).
 * Répond au rapport de test : sans boîtier physique, il était impossible
 * de faire varier les mesures et donc de valider le système.
 *
 * Le relevé est marqué `simule` en base et signalé à l'écran : un chiffre
 * de test ne doit jamais pouvoir passer pour une mesure du terrain.
 * Sans valeurs fournies, le serveur en tire au hasard.
 */
export async function envoyerReleveDeTest(
  parcelId: string,
  valeurs?: Partial<SensorSnapshot>
): Promise<void> {
  await apiFetch(`/api/parcels/${parcelId}/simulation/releve`, {
    method: "POST",
    body: JSON.stringify(valeurs ?? {}),
  });
}
