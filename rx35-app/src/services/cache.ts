// ============================================================
// Cache hors connexion.
//
// Cahier §13 : « L'accueil et l'historique restent pleinement consultables
// sans connexion internet, grâce à une mise en cache locale des dernières
// données reçues. »
//
// Avant, l'app basculait sur des données de DÉMONSTRATION quand le réseau
// manquait : un agriculteur pouvait croire lire son sol alors qu'il voyait
// des chiffres inventés. On conserve désormais les dernières vraies
// données, horodatées, et l'interface indique clairement leur ancienneté.
//
// expo-file-system plutôt que SecureStore : ce dernier est limité à
// quelques kilo-octets par entrée, insuffisant pour un historique.
// ============================================================
import * as FileSystem from "expo-file-system";

const DOSSIER = `${FileSystem.documentDirectory}rx35-cache/`;

export interface Cached<T> {
  data: T;
  /** epoch (s) de la mise en cache */
  savedAt: number;
}

let dossierPret = false;
async function assurerDossier(): Promise<void> {
  if (dossierPret) return;
  const info = await FileSystem.getInfoAsync(DOSSIER);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DOSSIER, { intermediates: true });
  dossierPret = true;
}

// Les clés contiennent des identifiants de parcelle : on les assainit pour
// obtenir un nom de fichier valide.
const fichier = (cle: string) => `${DOSSIER}${cle.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;

export async function saveCache<T>(cle: string, data: T): Promise<void> {
  try {
    await assurerDossier();
    const enveloppe: Cached<T> = { data, savedAt: Date.now() / 1000 };
    await FileSystem.writeAsStringAsync(fichier(cle), JSON.stringify(enveloppe));
  } catch {
    // Le cache est un confort : un échec d'écriture ne doit jamais
    // interrompre l'utilisation de l'application.
  }
}

export async function loadCache<T>(cle: string): Promise<Cached<T> | null> {
  try {
    await assurerDossier();
    const info = await FileSystem.getInfoAsync(fichier(cle));
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(fichier(cle))) as Cached<T>;
  } catch {
    return null;
  }
}

/** Vide le cache (changement de compte : les données ne doivent pas fuiter). */
export async function clearCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(DOSSIER);
    if (info.exists) await FileSystem.deleteAsync(DOSSIER, { idempotent: true });
    dossierPret = false;
  } catch {
    // sans conséquence
  }
}

export interface Resultat<T> {
  data: T;
  /** true si la valeur vient du cache faute de réseau */
  horsConnexion: boolean;
  /** date de mise en cache, seulement si horsConnexion */
  savedAt?: number;
}

/**
 * Tente le réseau ; en cas d'échec, sert la dernière valeur connue.
 * Une erreur n'est propagée que si le cache est vide lui aussi — l'app
 * sait alors qu'elle n'a vraiment rien à afficher.
 */
export async function avecCache<T>(cle: string, recuperer: () => Promise<T>): Promise<Resultat<T>> {
  try {
    const data = await recuperer();
    await saveCache(cle, data);
    return { data, horsConnexion: false };
  } catch (err) {
    const cache = await loadCache<T>(cle);
    if (cache) return { data: cache.data, horsConnexion: true, savedAt: cache.savedAt };
    throw err;
  }
}
