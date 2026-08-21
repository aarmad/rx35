// ============================================================
// Base de connaissances locale — diagnostics hors connexion.
//
// POURQUOI EMBARQUÉE DANS L'APPLICATION : une parcelle est rarement
// couverte par le réseau, et c'est précisément au champ, devant une plante
// malade, qu'on a besoin d'un avis. Ces fiches sont donc dans le bundle :
// aucune requête, aucune clé d'API, aucun délai.
//
// RAPPORT AVEC L'ASSISTANT IA : l'assistant reste meilleur pour dialoguer
// et pour analyser une photo, mais il exige du réseau. Quand il n'y en a
// pas, l'application bascule ici plutôt que d'afficher une erreur.
//
// HONNÊTETÉ : ce sont des pistes de diagnostic fondées sur des symptômes
// visibles, pas un verdict. Chaque fiche le dit. Les fiches couvrent les
// cinq cultures gérées par RX35 et les problèmes les plus fréquents en
// zone tropicale humide (Sud-Togo).
// ============================================================
import { Culture } from "@/services/types";

export interface FicheDiagnostic {
  id: string;
  titre: string;
  /** Cultures concernées ; vide = toutes. */
  cultures: Culture[];
  /** Ce que l'agriculteur voit. Sert aussi à la recherche. */
  symptomes: string[];
  causesProbables: string[];
  quoiFaire: string[];
  /** Mesures RX35 qui appuient ou infirment l'hypothèse. */
  aVerifierDansLApp?: string;
  /** Mots supplémentaires acceptés dans la recherche. */
  motsCles?: string[];
}

export const FICHES: FicheDiagnostic[] = [
  {
    id: "jaunissement-vieilles-feuilles",
    titre: "Feuilles du bas qui jaunissent",
    cultures: [],
    symptomes: [
      "Les feuilles les plus anciennes, en bas, jaunissent d'abord",
      "Le jaunissement est uniforme, nervures comprises",
      "La plante pousse lentement et reste pâle",
    ],
    causesProbables: [
      "Carence en azote — la plante déplace l'azote des vieilles feuilles vers les jeunes",
      "Lessivage après de fortes pluies sur sol sableux",
      "Sol acide qui bloque l'assimilation",
    ],
    quoiFaire: [
      "Apport azoté fractionné (urée ou compost bien décomposé) plutôt qu'une dose unique",
      "Arroser après l'apport pour faire descendre l'azote aux racines",
      "Si le sol est acide, corriger le pH : sans cela l'engrais sera mal absorbé",
    ],
    aVerifierDansLApp: "Relevé NPK (azote) et pH du sol sur l'écran d'accueil",
    motsCles: ["jaune", "jaunit", "pale", "azote", "engrais"],
  },
  {
    id: "jaunissement-entre-nervures",
    titre: "Jaunissement entre les nervures, jeunes feuilles",
    cultures: [],
    symptomes: [
      "Ce sont les jeunes feuilles, en haut, qui sont touchées",
      "Les nervures restent vertes, le limbe jaunit entre elles",
    ],
    causesProbables: [
      "Carence en fer ou en zinc, fréquente quand le pH est trop élevé",
      "Sol calcaire ou excès de chaulage",
    ],
    quoiFaire: [
      "Ne pas ajouter d'azote : ce n'est pas la cause",
      "Apporter de la matière organique bien décomposée pour faire baisser le pH progressivement",
      "Éviter d'irriguer avec une eau très calcaire",
    ],
    aVerifierDansLApp: "pH du sol — au-dessus de 7,5 cette piste est probable",
    motsCles: ["nervure", "fer", "zinc", "chlorose"],
  },
  {
    id: "fletrissement-sol-humide",
    titre: "Plante flétrie alors que le sol est humide",
    cultures: [],
    symptomes: [
      "La plante fane en pleine journée et ne se redresse pas la nuit",
      "Le sol est pourtant humide au toucher",
      "La base de la tige peut être brune ou molle",
    ],
    causesProbables: [
      "Excès d'eau : les racines asphyxiées ne peuvent plus absorber",
      "Pourriture du collet ou fusariose favorisée par l'humidité stagnante",
    ],
    quoiFaire: [
      "Couper l'irrigation immédiatement",
      "Améliorer le drainage : billons, rigoles d'évacuation",
      "Arracher et brûler les pieds atteints — ne pas les mettre au compost",
      "Ne pas replanter la même famille au même endroit la saison suivante",
    ],
    aVerifierDansLApp: "Humidité du sol : au-dessus de 85 %, l'excès d'eau est la piste principale",
    motsCles: ["fane", "fletri", "pourri", "collet", "mou"],
  },
  {
    id: "fletrissement-sol-sec",
    titre: "Plante flétrie et sol sec",
    cultures: [],
    symptomes: ["Feuilles molles aux heures chaudes", "Le sol est sec en profondeur, pas seulement en surface"],
    causesProbables: ["Manque d'eau simple", "Irrigation trop superficielle : les racines restent en surface"],
    quoiFaire: [
      "Irriguer plus longuement mais moins souvent, pour faire descendre les racines",
      "Pailler le sol : cela divise l'évaporation",
      "Irriguer tôt le matin ou en fin de journée, jamais en plein soleil",
    ],
    aVerifierDansLApp: "Humidité du sol comparée au seuil de la culture, sur l'anneau de l'accueil",
    motsCles: ["sec", "soif", "manque eau", "fane"],
  },
  {
    id: "taches-brunes-tomate",
    titre: "Taches brunes sur feuilles et fruits",
    cultures: ["tomate", "piment"],
    symptomes: [
      "Taches brunes à noires, parfois cerclées de jaune",
      "Elles gagnent du bas vers le haut",
      "Par temps humide, un duvet gris peut apparaître sous la feuille",
    ],
    causesProbables: [
      "Mildiou, favorisé par l'humidité de l'air et le feuillage mouillé",
      "Alternariose sur plante affaiblie",
    ],
    quoiFaire: [
      "Retirer et brûler les feuilles atteintes dès les premiers signes",
      "Arroser au pied, jamais sur le feuillage",
      "Aérer : espacer les plants, tuteurer, supprimer les feuilles basses",
      "Traiter préventivement à la bouillie bordelaise en saison humide",
    ],
    aVerifierDansLApp: "Humidité de l'air : au-delà de 80 % durablement, le risque est élevé",
    motsCles: ["tache", "brun", "noir", "mildiou", "duvet"],
  },
  {
    id: "cul-noir-tomate",
    titre: "Fond du fruit noir et dur",
    cultures: ["tomate", "piment"],
    symptomes: ["Tache brune, sèche et enfoncée sous le fruit", "Les feuilles restent normales"],
    causesProbables: [
      "Manque de calcium dans le fruit — le plus souvent parce que l'eau a manqué par à-coups, pas parce que le sol manque de calcium",
      "Irrigation irrégulière : périodes sèches suivies d'arrosages abondants",
    ],
    quoiFaire: [
      "Régulariser l'irrigation : c'est la mesure la plus efficace",
      "Pailler pour amortir les variations d'humidité",
      "Éviter les excès d'azote, qui aggravent le phénomène",
    ],
    aVerifierDansLApp: "Historique de l'humidité du sol : cherchez les dents de scie",
    motsCles: ["cul noir", "fond noir", "fruit", "calcium", "necrose"],
  },
  {
    id: "chenilles-mais",
    titre: "Feuilles perforées, cœur dévoré",
    cultures: ["mais"],
    symptomes: [
      "Trous alignés sur les feuilles déroulées",
      "Sciure humide au cœur de la plante",
      "Chenille visible dans le cornet",
    ],
    causesProbables: ["Chenille légionnaire d'automne (Spodoptera frugiperda)", "Foreurs de tige"],
    quoiFaire: [
      "Inspecter tôt le matin et retirer les chenilles à la main sur petites surfaces",
      "Traiter au cœur du cornet, là où la chenille se tient, et non sur l'ensemble du feuillage",
      "Favoriser les auxiliaires : ne pas traiter à l'aveugle",
      "Semer en même temps que les voisins : les semis décalés concentrent les attaques",
    ],
    motsCles: ["chenille", "trou", "perfore", "cornet", "legionnaire", "insecte"],
  },
  {
    id: "pucerons",
    titre: "Feuilles collantes, enroulées, petits insectes groupés",
    cultures: [],
    symptomes: [
      "Amas de petits insectes verts ou noirs sous les feuilles et sur les jeunes pousses",
      "Feuilles poisseuses, parfois couvertes d'un dépôt noir",
      "Présence inhabituelle de fourmis",
    ],
    causesProbables: ["Pucerons", "Excès d'azote qui produit des pousses tendres et attractives"],
    quoiFaire: [
      "Douchage à l'eau savonneuse (savon noir) sur le dessous des feuilles",
      "Ne pas détruire les coccinelles : elles règlent le problème durablement",
      "Réduire les apports azotés",
      "Surveiller : les pucerons transmettent des viroses",
    ],
    motsCles: ["puceron", "collant", "fourmi", "enroule", "insecte"],
  },
  {
    id: "bulbes-oignon-pourris",
    titre: "Bulbes mous ou pourris à la récolte",
    cultures: ["oignon"],
    symptomes: ["Bulbe mou au toucher", "Odeur désagréable", "Le col reste épais et vert"],
    causesProbables: [
      "Irrigation poursuivie trop tard dans le cycle",
      "Récolte sur sol humide, ou séchage insuffisant",
    ],
    quoiFaire: [
      "Arrêter l'irrigation quand les feuilles commencent à se coucher",
      "Récolter par temps sec et laisser ressuyer à l'ombre, bien aéré",
      "Éliminer les bulbes atteints avant le stockage : un seul contamine le lot",
    ],
    aVerifierDansLApp: "Le seuil d'humidité baisse au stade maturation — vérifiez que l'irrigation suit",
    motsCles: ["bulbe", "pourri", "mou", "stockage", "oignon"],
  },
  {
    id: "riz-jaunissement-parcelle",
    titre: "Jaunissement général de la rizière",
    cultures: ["riz"],
    symptomes: ["Décoloration par plaques ou générale", "Tallage faible"],
    causesProbables: [
      "Lame d'eau insuffisante ou irrégulière",
      "Carence en azote, très fréquente en riziculture",
      "Sol trop acide",
    ],
    quoiFaire: [
      "Maintenir une lame d'eau régulière : le riz supporte mal l'alternance sec/humide",
      "Fractionner l'azote, notamment au tallage",
      "Contrôler le pH : sous 5, corriger avant la campagne suivante",
    ],
    aVerifierDansLApp: "Le riz demande une humidité du sol autour de 80 % — comparez au relevé",
    motsCles: ["riz", "jaune", "tallage", "riziere"],
  },
  {
    id: "croissance-bloquee",
    titre: "La plante ne grandit plus",
    cultures: [],
    symptomes: ["Croissance arrêtée sans symptôme marqué sur les feuilles", "Plants inégaux sur la parcelle"],
    causesProbables: [
      "Sol compacté : les racines ne descendent pas",
      "Carence en phosphore, courante sur sol acide",
      "Concurrence des adventices",
      "Températures durablement au-dessus du confort de la culture",
    ],
    quoiFaire: [
      "Sarcler : la concurrence des herbes est souvent sous-estimée",
      "Ameublir sans retourner en profondeur",
      "Corriger le pH avant d'ajouter du phosphore, sinon il restera bloqué",
    ],
    aVerifierDansLApp: "pH, NPK et températures maximales de l'historique",
    motsCles: ["petit", "bloque", "grandit pas", "rabougri", "phosphore"],
  },
  {
    id: "boitier-silencieux",
    titre: "Le boîtier n'envoie plus de mesures",
    cultures: [],
    symptomes: [
      "L'accueil indique que le dernier relevé est ancien",
      "Aucune nouvelle donnée depuis plusieurs heures",
    ],
    causesProbables: [
      "Batterie vide : panneau solaire sale, à l'ombre, ou mal orienté",
      "Wi-Fi hors de portée ou box redémarrée",
      "Clé du boîtier modifiée dans l'application sans être recopiée dans le firmware",
    ],
    quoiFaire: [
      "Nettoyer le panneau solaire et vérifier qu'aucune végétation ne lui fait de l'ombre",
      "Vérifier la portée Wi-Fi à l'emplacement du boîtier",
      "Recréer un boîtier dans Réglages et recopier la nouvelle clé dans le firmware",
    ],
    aVerifierDansLApp: "Niveau de batterie du dernier relevé reçu",
    motsCles: ["boitier", "capteur", "plus de donnees", "batterie", "wifi", "esp32"],
  },
];

// Recherche volontairement tolérante : l'agriculteur tape « feuille jaune »,
// pas le titre exact de la fiche. On ignore les accents et la casse, et on
// classe par nombre de mots retrouvés.
function normaliser(s: string): string {
  // NFD sépare la lettre de son accent ; on ne garde ensuite que les
  // lettres, chiffres et espaces. « flétri » et « fletri » se rejoignent
  // donc, sans dépendre d'un littéral de caractères combinants dans le
  // source (fragile selon l'encodage du fichier).
  const decompose = s.toLowerCase().normalize("NFD");
  let out = "";
  for (const c of decompose) {
    const code = c.codePointAt(0)!;
    // Marques combinantes laissées par NFD : à SUPPRIMER, surtout pas à
    // remplacer par un espace — « flétri » deviendrait « fle tri ».
    if (code >= 0x0300 && code <= 0x036f) continue;
    if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) out += c;
    else out += " ";
  }
  return out;
}

const MOTS_IGNORES = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "ou", "a", "au", "aux",
  "mes", "mon", "ma", "sur", "dans", "est", "sont", "que", "qui", "pour", "avec",
  "je", "il", "elle", "plante", "plantes",
]);

export function rechercherFiches(question: string, culture?: Culture): FicheDiagnostic[] {
  const mots = normaliser(question).split(/\s+/).filter((m) => m.length > 2 && !MOTS_IGNORES.has(m));
  if (mots.length === 0) return [];

  const scores = FICHES.map((f) => {
    // Une fiche propre à d'autres cultures ne doit pas remonter.
    if (culture && f.cultures.length > 0 && !f.cultures.includes(culture)) return { f, score: 0 };

    const texte = normaliser(
      [f.titre, ...f.symptomes, ...f.causesProbables, ...(f.motsCles ?? [])].join(" ")
    );
    let score = mots.filter((m) => texte.includes(m)).length;
    // Une fiche ciblant explicitement la culture est plus pertinente.
    if (culture && f.cultures.includes(culture)) score += 0.5;
    return { f, score };
  });

  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.f);
}
