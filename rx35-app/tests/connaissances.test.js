// ============================================================
// Tests de la base de connaissances hors connexion.
//
//   node tests/connaissances.test.js
//
// Ce qu'ils protègent : au champ, sans réseau, la recherche doit trouver
// la bonne fiche à partir des mots que l'agriculteur emploie réellement
// (« feuille jaune », pas « chlorose ferrique »), et ne doit jamais
// proposer une fiche destinée à une autre culture.
// ============================================================
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Module = require("module");

const racine = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rx35-kb-"));

// tsconfig dédié : le fichier importe ses types via l'alias "@/", que tsc
// ne résout pas en compilation d'un fichier isolé.
const configPath = path.join(tmp, "tsconfig.json");
fs.writeFileSync(
  configPath,
  JSON.stringify({
    compilerOptions: {
      outDir: tmp,
      rootDir: path.join(racine, "src"),
      module: "commonjs",
      target: "es2019",
      moduleResolution: "node",
      skipLibCheck: true,
      esModuleInterop: true,
      baseUrl: racine,
      paths: { "@/*": ["src/*"] },
    },
    files: [path.join(racine, "src", "knowledge", "baseConnaissances.ts")],
  })
);

execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", configPath], {
  cwd: racine,
  stdio: "inherit",
});

// L'alias survit dans le JS émis ; les types ayant disparu à la compilation,
// un module vide suffit.
const chargerVrai = Module._load;
Module._load = (req, ...r) => (req.startsWith("@/") ? {} : chargerVrai.call(Module, req, ...r));

const { rechercherFiches, FICHES } = require(path.join(tmp, "knowledge", "baseConnaissances.js"));

let echecs = 0;
const verifier = (nom, ok) => {
  console.log(`  ${ok ? "OK   " : "ÉCHEC"}  ${nom}`);
  if (!ok) echecs++;
};
const ids = (r) => r.map((f) => f.id);

console.log("\n1. Les mots de tous les jours trouvent la bonne fiche");
{
  verifier("« mes feuilles du bas jaunissent »",
    ids(rechercherFiches("mes feuilles du bas jaunissent")).includes("jaunissement-vieilles-feuilles"));
  verifier("« la plante fane mais le sol est humide »",
    ids(rechercherFiches("la plante fane mais le sol est humide")).includes("fletrissement-sol-humide"));
  verifier("« des taches brunes sur les tomates »",
    ids(rechercherFiches("des taches brunes sur les tomates", "tomate")).includes("taches-brunes-tomate"));
  verifier("« petits insectes collants sous les feuilles »",
    ids(rechercherFiches("petits insectes collants sous les feuilles")).includes("pucerons"));
  verifier("« le boitier n envoie plus rien »",
    ids(rechercherFiches("le boitier n envoie plus rien")).includes("boitier-silencieux"));
}

console.log("\n2. Les accents ne doivent rien casser");
{
  const avec = ids(rechercherFiches("plante flétrie"));
  const sans = ids(rechercherFiches("plante fletrie"));
  verifier("« flétrie » et « fletrie » donnent le même résultat", JSON.stringify(avec) === JSON.stringify(sans));
  verifier("et ce résultat n'est pas vide", avec.length > 0);
}

console.log("\n3. Pas de conseil destiné à une autre culture");
{
  const r = rechercherFiches("chenille dans le cornet", "tomate");
  verifier("la fiche maïs ne remonte pas pour une tomate", !ids(r).includes("chenilles-mais"));
  const m = rechercherFiches("chenille dans le cornet", "mais");
  verifier("elle remonte bien pour du maïs", ids(m).includes("chenilles-mais"));
}

console.log("\n4. La culture concernée est privilégiée");
{
  const r = rechercherFiches("bulbe mou pourri", "oignon");
  verifier("l'oignon arrive en tête", r.length > 0 && r[0].id === "bulbes-oignon-pourris");
}

console.log("\n5. Ne rien inventer quand on ne sait pas");
{
  verifier("question hors sujet => aucune fiche", rechercherFiches("prix du carburant a lome").length === 0);
  verifier("question vide => aucune fiche", rechercherFiches("").length === 0);
  verifier("que des mots vides => aucune fiche", rechercherFiches("le la les des").length === 0);
}

console.log("\n6. Au plus 3 fiches, pour rester lisible sur un téléphone");
{
  verifier("jamais plus de 3 résultats", rechercherFiches("feuille jaune sol eau plante tache").length <= 3);
}

console.log("\n7. Toutes les fiches sont exploitables");
{
  verifier("chacune a un titre", FICHES.every((f) => f.titre && f.titre.length > 3));
  verifier("chacune décrit des symptômes", FICHES.every((f) => f.symptomes.length > 0));
  verifier("chacune propose des causes", FICHES.every((f) => f.causesProbables.length > 0));
  verifier("chacune dit quoi faire", FICHES.every((f) => f.quoiFaire.length > 0));
  verifier("les identifiants sont uniques", new Set(FICHES.map((f) => f.id)).size === FICHES.length);
}

console.log(echecs === 0 ? `\nBase de connaissances : ${FICHES.length} fiches, tous les tests passent.\n`
                         : `\n${echecs} test(s) en échec.\n`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(echecs === 0 ? 0 : 1);
