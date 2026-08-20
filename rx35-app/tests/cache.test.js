// ============================================================
// Test du cache hors connexion (src/services/cache.ts).
//
// Ce qu'il protège : l'application affichait autrefois des données de
// DÉMONSTRATION quand le réseau manquait. Un agriculteur pouvait décider
// d'arroser en croyant lire son sol alors qu'il voyait des chiffres
// inventés. Ces tests vérifient qu'on ne sert plus jamais que de vraies
// données déjà reçues, ou rien du tout.
//
//   node tests/cache.test.js
//
// expo-file-system est remplacé par le disque local : le vrai code du
// cache est exécuté tel quel, seul le stockage change.
// ============================================================
const Module = require("module");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const racineApp = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rx35-cache-"));
const sortieTsc = path.join(tmp, "compile");
const disque = path.join(tmp, "disque");
fs.mkdirSync(disque, { recursive: true });

// Compile cache.ts isolément (pas de dépendance à un lanceur de tests).
execFileSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "src/services/cache.ts", "--outDir", sortieTsc,
   "--module", "commonjs", "--target", "es2019", "--skipLibCheck", "--esModuleInterop"],
  { cwd: racineApp, stdio: "inherit" }
);

const versChemin = (uri) => path.join(disque, uri.replace(/^file:\/\/racine\//, ""));
const fauxFileSystem = {
  documentDirectory: "file://racine/",
  async getInfoAsync(uri) { return { exists: fs.existsSync(versChemin(uri)) }; },
  async makeDirectoryAsync(uri) { fs.mkdirSync(versChemin(uri), { recursive: true }); },
  async writeAsStringAsync(uri, c) { fs.writeFileSync(versChemin(uri), c, "utf8"); },
  async readAsStringAsync(uri) { return fs.readFileSync(versChemin(uri), "utf8"); },
  async deleteAsync(uri) { fs.rmSync(versChemin(uri), { recursive: true, force: true }); },
};
const chargerVrai = Module._load;
Module._load = (req, ...r) =>
  req === "expo-file-system" ? fauxFileSystem : chargerVrai.call(Module, req, ...r);

const { avecCache, clearCache, loadCache } = require(path.join(sortieTsc, "cache.js"));

let echecs = 0;
const verifier = (nom, ok) => {
  console.log(`  ${ok ? "OK   " : "ÉCHEC"}  ${nom}`);
  if (!ok) echecs++;
};

(async () => {
  const CLE = "parcelle-1:sensors";
  const RELEVE = { humidite: 41, temperature: 29.5 };
  const reseauOk = async () => RELEVE;
  const reseauCoupe = async () => { throw new Error("Network request failed"); };

  console.log("\n1. Réseau disponible");
  let r = await avecCache(CLE, reseauOk);
  verifier("les vraies données sont renvoyées", r.data.humidite === 41);
  verifier("aucune bannière hors connexion", r.horsConnexion === false);

  console.log("\n2. Réseau coupé, cache présent");
  r = await avecCache(CLE, reseauCoupe);
  verifier("les dernières VRAIES données ressortent", r.data.humidite === 41);
  verifier("marquées comme hors connexion", r.horsConnexion === true);
  verifier("horodatées (l'écran affiche la date)", typeof r.savedAt === "number" && r.savedAt > 0);

  console.log("\n3. Réseau coupé, aucun cache : ne rien inventer");
  let leve = null;
  try { await avecCache("parcelle-1:jamais-vue", reseauCoupe); } catch (e) { leve = e; }
  verifier("l'erreur remonte jusqu'à l'écran", leve !== null);
  verifier("aucune donnée de démonstration", leve !== null && /Network/.test(leve.message));

  console.log("\n4. Le cache suit les valeurs les plus récentes");
  await avecCache(CLE, async () => ({ humidite: 18, temperature: 34 }));
  r = await avecCache(CLE, reseauCoupe);
  verifier("c'est bien le dernier relevé qui est servi", r.data.humidite === 18);

  console.log("\n5. Déconnexion : les données d'un compte ne fuitent pas");
  await clearCache();
  verifier("le cache est vidé", (await loadCache(CLE)) === null);
  let leve2 = null;
  try { await avecCache(CLE, reseauCoupe); } catch (e) { leve2 = e; }
  verifier("plus rien à servir au compte suivant", leve2 !== null);

  console.log(echecs === 0 ? "\nTous les tests du cache passent.\n" : `\n${echecs} test(s) en échec.\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(echecs === 0 ? 0 : 1);
})();
