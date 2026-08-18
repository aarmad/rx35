// tsc ne copie que le TypeScript compilé : les fichiers .sql resteraient
// dans src/ et le serveur planterait au démarrage en production
// (ENOENT sur dist/db/schema.sql). Ce script comble ce trou.
// Écrit en Node plutôt qu'avec cp/copy pour fonctionner aussi bien sous
// Windows (développement) que sous Linux (Render).
const fs = require("fs");
const path = require("path");

const racine = path.join(__dirname, "..");
const actifs = ["db/schema.sql"];

for (const actif of actifs) {
  const source = path.join(racine, "src", actif);
  const cible = path.join(racine, "dist", actif);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.copyFileSync(source, cible);
  console.log(`copié : src/${actif} -> dist/${actif}`);
}
