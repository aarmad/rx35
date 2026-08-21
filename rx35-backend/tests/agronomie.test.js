// ============================================================
// Tests du moteur de recommandations agronomiques.
//
//   npm run build && node tests/agronomie.test.js
//
// Ces règles disent à un agriculteur s'il doit irriguer. Une erreur ici
// coûte de l'eau, du carburant, ou une récolte — d'où des tests sur les
// cas de décision, et pas seulement sur « ça ne plante pas ».
// ============================================================
const path = require("path");
const { construireRecommandations } = require(path.join(__dirname, "..", "dist", "services", "agronomie.js"));

let echecs = 0;
const verifier = (nom, ok) => {
  console.log(`  ${ok ? "OK   " : "ÉCHEC"}  ${nom}`);
  if (!ok) echecs++;
};

const maintenant = () => Date.now() / 1000;

// Relevé « tout va bien » pour une tomate en croissance ; chaque test ne
// modifie que ce qui l'intéresse.
const releve = (extra = {}) => ({
  timestamp: maintenant(),
  temperatureC: 28,
  humidityAirPct: 60,
  pressureHpa: 1012,
  lux: 800,
  soilMoisturePct: 65,
  soilPh: 6.2,
  waterLevelPct: 80,
  flowLpm: 0,
  flowTotalL: 0,
  batteryPct: 90,
  motion: false,
  ...extra,
});

// Tomate semée il y a 40 jours => stade « croissance », seuil 55 %.
const ctx = (extra = {}) => ({
  culture: "tomate",
  datePlantation: new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10),
  dernier: releve(),
  historique: [],
  npk: null,
  meteo: [],
  alertes: [],
  irrigation: { irrigationMode: "auto", pumpManualOn: false },
  ...extra,
});

const ids = (r) => r.map((x) => x.id);
const trouver = (r, id) => r.find((x) => x.id === id);

console.log("\n1. Sol sec, pas de pluie annoncée");
{
  const r = construireRecommandations(ctx({ dernier: releve({ soilMoisturePct: 40 }) }));
  const reco = trouver(r, "irrigation-necessaire");
  verifier("conseille d'irriguer", !!reco);
  verifier("marqué urgent (15 points sous le seuil)", reco && reco.priorite === "urgent");
  verifier("cite l'humidité mesurée", reco && reco.fondement.some((f) => f.includes("40")));
  verifier("cite le seuil de la culture", reco && reco.fondement.some((f) => f.includes("55")));
}

console.log("\n2. Sol sec MAIS pluie annoncée : ne pas gaspiller l'eau");
{
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const r = construireRecommandations(
    ctx({
      dernier: releve({ soilMoisturePct: 40 }),
      meteo: [{ date: demain, tempMinC: 24, tempMaxC: 30, pluieMm: 18, pluiePrevue: true }],
    })
  );
  verifier("conseille d'attendre", ids(r).includes("irrigation-attendre-pluie"));
  verifier("n'ordonne PAS d'irriguer en même temps", !ids(r).includes("irrigation-necessaire"));
  verifier("cite la pluie prévue", trouver(r, "irrigation-attendre-pluie").fondement.some((f) => f.includes("18")));
}

console.log("\n3. Pluie insignifiante (1 mm) : elle ne doit pas suffire à surseoir");
{
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const r = construireRecommandations(
    ctx({
      dernier: releve({ soilMoisturePct: 40 }),
      meteo: [{ date: demain, tempMinC: 24, tempMaxC: 30, pluieMm: 1, pluiePrevue: false }],
    })
  );
  verifier("conseille quand même d'irriguer", ids(r).includes("irrigation-necessaire"));
}

console.log("\n4. Pompe qui tourne alors que le sol est humide");
{
  const r = construireRecommandations(
    ctx({ dernier: releve({ soilMoisturePct: 70 }), irrigation: { irrigationMode: "manuel", pumpManualOn: true } })
  );
  verifier("signale le gaspillage", ids(r).includes("pompe-inutile"));
}

console.log("\n5. Sol détrempé");
{
  const r = construireRecommandations(ctx({ dernier: releve({ soilMoisturePct: 95 }) }));
  verifier("alerte sur l'excès d'eau", ids(r).includes("sol-detrempe"));
  verifier("ne conseille pas d'irriguer", !ids(r).includes("irrigation-necessaire"));
}

console.log("\n6. Le seuil dépend du stade ET de la culture");
{
  // Riz en croissance : seuil 80 %. 65 % est sec pour le riz, humide pour la tomate.
  const riz = construireRecommandations(
    ctx({ culture: "riz", dernier: releve({ soilMoisturePct: 65 }) })
  );
  const tomate = construireRecommandations(ctx({ dernier: releve({ soilMoisturePct: 65 }) }));
  verifier("65 % => irriguer pour le riz", ids(riz).includes("irrigation-necessaire"));
  verifier("65 % => rien à signaler pour la tomate", !ids(tomate).includes("irrigation-necessaire"));
}

console.log("\n7. Réservoir vide");
{
  const r = construireRecommandations(ctx({ dernier: releve({ waterLevelPct: 8 }) }));
  const reco = trouver(r, "reservoir-bas");
  verifier("prévient avant que la pompe tourne à sec", !!reco);
  verifier("urgent sous 10 %", reco && reco.priorite === "urgent");
}

console.log("\n8. Boîtier muet depuis 5 h");
{
  const r = construireRecommandations(ctx({ dernier: releve({ timestamp: maintenant() - 5 * 3600 }) }));
  verifier("prévient que la mesure est ancienne", ids(r).includes("boitier-muet"));
}

console.log("\n9. Aucun relevé : ne rien inventer");
{
  const r = construireRecommandations(ctx({ dernier: null }));
  verifier("une seule consigne : brancher le boîtier", r.length === 1 && r[0].id === "aucun-releve");
  verifier("aucun conseil d'irrigation sans mesure", !ids(r).includes("irrigation-necessaire"));
}

console.log("\n10. Assèchement rapide anticipé");
{
  const j = (n) => maintenant() - n * 86400;
  const r = construireRecommandations(
    ctx({
      dernier: releve({ soilMoisturePct: 62 }),
      historique: [
        releve({ timestamp: j(4), soilMoisturePct: 85 }),
        releve({ timestamp: j(2), soilMoisturePct: 74 }),
        releve({ timestamp: j(0), soilMoisturePct: 62 }),
      ],
    })
  );
  verifier("prévient avant de passer sous le seuil", ids(r).includes("assechement-rapide"));
}

console.log("\n11. Passages répétés sur la parcelle");
{
  const a = (h, type) => ({ id: String(Math.random()), timestamp: maintenant() - h * 3600, type, message: "", lu: false });
  const r = construireRecommandations(
    ctx({ alertes: [a(2, "mouvement"), a(10, "mouvement"), a(30, "mouvement"), a(200, "mouvement")] })
  );
  verifier("signale les 3 passages des 48 h (le 4e est trop vieux)", ids(r).includes("intrusions-repetees"));
}

console.log("\n12. Chaque recommandation est justifiée, et les urgences passent devant");
{
  const r = construireRecommandations(
    ctx({ dernier: releve({ soilMoisturePct: 35, waterLevelPct: 5, batteryPct: 12, soilPh: 4.8 }) })
  );
  verifier("toutes portent un fondement chiffré", r.every((x) => x.fondement.length > 0));
  verifier("toutes ont un titre et un détail", r.every((x) => x.titre && x.detail));
  const rangs = { urgent: 0, important: 1, info: 2 };
  const ordonne = r.every((x, i) => i === 0 || rangs[r[i - 1].priorite] <= rangs[x.priorite]);
  verifier("triées par priorité décroissante", ordonne);
}

console.log("\n13. Tout va bien");
{
  const r = construireRecommandations(ctx());
  verifier("dit que rien n'est à signaler", r.length === 1 && r[0].id === "rien-a-signaler");
}


console.log("\n14. Alertes graduées : humain, animal, indéterminé");
{
  const a = (h, type) => ({ id: String(Math.random()), timestamp: maintenant() - h * 3600, type, message: '', lu: false });

  const humain = construireRecommandations(ctx({ alertes: [a(2, 'presence_humaine')] }));
  verifier('une SEULE presence humaine declenche une alerte', ids(humain).includes('presence-humaine'));
  verifier('et elle est urgente', trouver(humain, 'presence-humaine').priorite === 'urgent');

  const unAnimal = construireRecommandations(ctx({ alertes: [a(2, 'passage_animal')] }));
  verifier('un seul passage d animal ne declenche rien', !ids(unAnimal).includes('passages-animaux'));

  const animaux = construireRecommandations(ctx({ alertes: [a(2,'passage_animal'), a(6,'passage_animal'), a(20,'passage_animal')] }));
  verifier('trois passages d animaux : conseil de cloture', ids(animaux).includes('passages-animaux'));
  verifier('mais pas urgent, contrairement a un humain', trouver(animaux, 'passages-animaux').priorite === 'important');

  const flous = construireRecommandations(ctx({ alertes: [a(2,'mouvement'), a(6,'mouvement'), a(20,'mouvement')] }));
  verifier('mouvements non identifies comptes a part', ids(flous).includes('intrusions-repetees'));
  verifier('ils ne sont pas pris pour des humains', !ids(flous).includes('presence-humaine'));
}

console.log(echecs === 0 ? "\nToutes les règles agronomiques passent.\n" : `\n${echecs} test(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
