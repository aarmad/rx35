// ============================================================
// Service cartographie satellite (NDVI) — Sentinel Hub / Copernicus.
//
// Cahier de présentation §8 : « Récupération d'images Sentinel-2 sur les
// coordonnées GPS de la parcelle, calcul de l'indice de végétation NDVI ».
//
// STATUT : l'authentification OAuth2, l'appel à l'API Process de Sentinel
// Hub et le décodage de l'image NDVI renvoyée (GeoTIFF) sont implémentés
// selon la documentation publique de la Copernicus Data Space Ecosystem
// (identity.dataspace.copernicus.eu pour le jeton, sh.dataspace.copernicus.eu
// pour le traitement — vérifié à jour en août 2026). Le chemin "heureux"
// n'a PAS pu être testé contre le service réel dans cet environnement
// (aucun identifiant disponible ici) ; en revanche, le repli sur les
// données simulées en cas d'erreur (identifiants absents, service
// indisponible, image illisible) a été testé et fonctionne.
//
// Pour obtenir des identifiants :
//   1. Créez un compte gratuit sur https://dataspace.copernicus.eu
//   2. Connectez-vous, survolez l'icône de profil, cliquez "Sentinel Hub"
//      pour ouvrir le tableau de bord Sentinel Hub
//   3. Dans "User Settings" → "OAuth clients", créez un nouveau client :
//      vous obtenez un Client ID et un Client Secret
//   4. Renseignez-les dans .env (SENTINEL_HUB_CLIENT_ID / _SECRET)
// ============================================================
import { fromArrayBuffer } from "geotiff";

export interface NdviZone {
  zone: 1 | 2 | 3 | 4 | 5;
  row: number;
  col: number;
}

export interface NdviSnapshot {
  date: string;
  grid: NdviZone[];
  source: "sentinel-hub" | "simule";
}

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Échec d'authentification Sentinel Hub (HTTP ${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 30) * 1000 };
  return cachedToken.value;
}

// Convertit une valeur NDVI (-1 à 1) en zone de vigueur 1 (excellente) à 5 (stress).
function ndviToZone(ndvi: number): 1 | 2 | 3 | 4 | 5 {
  if (ndvi > 0.6) return 1;
  if (ndvi > 0.4) return 2;
  if (ndvi > 0.25) return 3;
  if (ndvi > 0.1) return 4;
  return 5;
}

function boundingBoxAround(lat: number, lon: number, marginMeters = 150) {
  const dLat = marginMeters / 111320;
  const dLon = marginMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

const EVALSCRIPT_NDVI = `
//VERSION=3
function setup() {
  return { input: ["B04", "B08"], output: { bands: 1, sampleType: "FLOAT32" } };
}
function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return [ndvi];
}
`;

async function fetchRealNdviGrid(lat: number, lon: number, date: string): Promise<NdviZone[] | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const bbox = boundingBoxAround(lat, lon);
  const rows = 6;
  const cols = 8;

  // Demande une image NDVI basse résolution (une valeur par cellule de la
  // grille) sur la fenêtre +/- 1 jour autour de la date choisie, en
  // sélectionnant la scène la moins nuageuse (mosaickingOrder: leastCC).
  const body = {
    input: {
      bounds: { bbox },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` },
            mosaickingOrder: "leastCC",
          },
        },
      ],
    },
    output: { width: cols, height: rows, responses: [{ identifier: "default", format: { type: "image/tiff" } }] },
    evalscript: EVALSCRIPT_NDVI,
  };

  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Pas de scène disponible à cette date (nuages, revisite), ou erreur —
    // on retombe sur le mode simulé plutôt que de faire planter l'appel.
    console.error(`[satellite] Sentinel Hub a renvoyé HTTP ${res.status} pour le ${date}.`);
    return null;
  }

  // La réponse est un GeoTIFF mono-bande (valeurs NDVI en flottant), de
  // exactement `cols` x `rows` pixels — un pixel par cellule de la grille
  // affichée dans l'application, pas besoin de sous-échantillonnage.
  try {
    const arrayBuffer = await res.arrayBuffer();
    const tiff = await fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const values = rasters[0] as unknown as ArrayLike<number>;
    const width = image.getWidth();
    const height = image.getHeight();

    const grid: NdviZone[] = [];
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const ndvi = values[row * width + col];
        grid.push({ zone: ndviToZone(ndvi), row, col });
      }
    }
    return grid;
  } catch (err) {
    console.error("[satellite] Échec du décodage de l'image NDVI (GeoTIFF) :", err);
    return null;
  }
}

function simulatedNdviGrid(date: string): NdviZone[] {
  const seed = new Date(date).getTime() / 100000;
  const rand = (n: number) => {
    const x = Math.sin(n) * 10000;
    return x - Math.floor(x);
  };
  const grid: NdviZone[] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      const ndvi = rand(seed + row * 8 + col) * 0.8 - 0.1;
      grid.push({ zone: ndviToZone(ndvi), row, col });
    }
  }
  return grid;
}

export async function getNdviSnapshot(lat: number, lon: number, date: string): Promise<NdviSnapshot> {
  try {
    const real = await fetchRealNdviGrid(lat, lon, date);
    if (real) return { date, grid: real, source: "sentinel-hub" };
  } catch (err) {
    console.error("[satellite] Échec de l'appel Sentinel Hub, repli sur les données simulées :", err);
  }
  return { date, grid: simulatedNdviGrid(date), source: "simule" };
}

export function getAvailableNdviDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i * 4);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
