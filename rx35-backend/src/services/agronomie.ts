// ============================================================
// Recommandations agronomiques.
//
// Croise TOUT ce que le système sait de la parcelle — dernier relevé,
// tendance sur 7 jours, prévisions météo, alertes récentes, culture et
// stade — pour répondre à la seule question qui intéresse l'agriculteur :
// « qu'est-ce que je fais maintenant ? »
//
// CHOIX ASSUMÉ : ces règles sont DÉTERMINISTES, pas générées par une IA.
//   - une recommandation d'irrigation engage une récolte : elle doit être
//     reproductible, vérifiable, et identique d'un jour à l'autre à
//     données égales ;
//   - chaque conseil porte son « fondement » : les chiffres exacts qui
//     l'ont déclenché, pour que l'agriculteur puisse juger par lui-même
//     plutôt que de croire une boîte noire ;
//   - cela fonctionne sans clé d'API et sans coût par appel.
// L'assistant IA reste là pour dialoguer ; il s'appuie sur ces règles.
//
// Les seuils sont des ordres de grandeur pour cultures maraîchères et
// vivrières d'Afrique de l'Ouest. Ils sont à affiner avec un agronome —
// d'où leur regroupement ici, en un seul endroit modifiable.
// ============================================================
import { AlertItem, Culture, NpkSnapshot, SensorSnapshot } from "../db/store";
import { WeatherDay } from "./weatherService";

export type Priorite = "urgent" | "important" | "info";

export interface Recommandation {
  id: string;
  priorite: Priorite;
  titre: string;
  detail: string;
  /** Les mesures qui ont déclenché la règle, telles quelles. */
  fondement: string[];
}

export type Stade = "levee" | "croissance" | "maturation";

interface SeuilsCulture {
  /** Humidité du sol (%) sous laquelle il faut irriguer, par stade. */
  humiditeMin: Record<Stade, number>;
  /** Au-dessus, le sol est détrempé : risque d'asphyxie racinaire. */
  humiditeMax: number;
  phMin: number;
  phMax: number;
  /** Températures au-delà desquelles la culture souffre. */
  tempMax: number;
  /** Azote (mg/kg) en dessous duquel une carence est probable. */
  azoteMin: number;
}

export const SEUILS: Record<Culture, SeuilsCulture> = {
  tomate: { humiditeMin: { levee: 60, croissance: 55, maturation: 45 }, humiditeMax: 85, phMin: 5.5, phMax: 7.0, tempMax: 35, azoteMin: 40 },
  mais: { humiditeMin: { levee: 55, croissance: 50, maturation: 40 }, humiditeMax: 85, phMin: 5.5, phMax: 7.5, tempMax: 38, azoteMin: 50 },
  riz: { humiditeMin: { levee: 80, croissance: 80, maturation: 60 }, humiditeMax: 100, phMin: 5.0, phMax: 7.0, tempMax: 38, azoteMin: 45 },
  piment: { humiditeMin: { levee: 60, croissance: 55, maturation: 45 }, humiditeMax: 85, phMin: 5.5, phMax: 7.0, tempMax: 35, azoteMin: 35 },
  oignon: { humiditeMin: { levee: 60, croissance: 50, maturation: 35 }, humiditeMax: 80, phMin: 6.0, phMax: 7.5, tempMax: 35, azoteMin: 40 },
};

const CYCLES: Record<Culture, { levee: number; croissance: number }> = {
  tomate: { levee: 20, croissance: 60 },
  mais: { levee: 25, croissance: 90 },
  riz: { levee: 25, croissance: 90 },
  piment: { levee: 25, croissance: 70 },
  oignon: { levee: 20, croissance: 80 },
};

export function stadeDeCroissance(culture: Culture, datePlantation: string): { stade: Stade; jours: number } {
  const jours = Math.max(0, Math.floor((Date.now() - new Date(datePlantation).getTime()) / 86_400_000));
  const c = CYCLES[culture];
  if (jours <= c.levee) return { stade: "levee", jours };
  if (jours <= c.croissance) return { stade: "croissance", jours };
  return { stade: "maturation", jours };
}

export interface ContexteParcelle {
  culture: Culture;
  datePlantation: string;
  dernier: SensorSnapshot | null;
  /** Relevés des 7 derniers jours, du plus ancien au plus récent. */
  historique: SensorSnapshot[];
  npk: NpkSnapshot | null;
  meteo: WeatherDay[];
  alertes: AlertItem[];
  irrigation: { irrigationMode: "auto" | "manuel"; pumpManualOn: boolean };
}

const SILENCE_BOITIER_S = 3 * 3600;

// Le stade sert de clé technique ; à l'écran il faut du français correct.
const LIBELLE_STADE: Record<Stade, string> = {
  levee: "levée",
  croissance: "croissance",
  maturation: "maturation",
};
const un = (n: number, d = 0) => n.toFixed(d);

/**
 * Pente de l'humidité du sol en points de % par jour, sur les relevés
 * fournis. Négative = le sol s'assèche. Renvoie null s'il n'y a pas assez
 * de points pour que la tendance veuille dire quelque chose.
 */
function tendanceHumidite(historique: SensorSnapshot[]): number | null {
  if (historique.length < 3) return null;
  const premier = historique[0];
  const dernier = historique[historique.length - 1];
  const jours = (dernier.timestamp - premier.timestamp) / 86_400;
  if (jours < 0.5) return null;
  return (dernier.soilMoisturePct - premier.soilMoisturePct) / jours;
}

/** Pluie utile (≥ 5 mm) attendue dans les prochaines 48 h. */
function pluieProche(meteo: WeatherDay[]): WeatherDay | null {
  return meteo.slice(0, 2).find((j) => j.pluieMm >= 5 || j.pluiePrevue) ?? null;
}

export function construireRecommandations(ctx: ContexteParcelle): Recommandation[] {
  const out: Recommandation[] = [];
  const seuils = SEUILS[ctx.culture];
  const { stade, jours } = stadeDeCroissance(ctx.culture, ctx.datePlantation);
  const seuilHumidite = seuils.humiditeMin[stade];
  const maintenant = Date.now() / 1000;

  // --- Sans relevé, tout le reste serait de l'invention ------------------
  if (!ctx.dernier) {
    out.push({
      id: "aucun-releve",
      priorite: "important",
      titre: "Aucune mesure disponible",
      detail:
        "Le boîtier n'a encore transmis aucun relevé. Aucune recommandation ne peut être formulée sans mesure du sol : " +
        "vérifiez que le boîtier est alimenté, connecté au Wi-Fi, et que sa clé est bien recopiée dans le firmware.",
      fondement: ["Aucun relevé en base pour cette parcelle"],
    });
    return out;
  }

  const d = ctx.dernier;
  const age = maintenant - d.timestamp;

  if (age > SILENCE_BOITIER_S) {
    out.push({
      id: "boitier-muet",
      priorite: "important",
      titre: "Le boîtier ne répond plus",
      detail:
        "Les conseils ci-dessous s'appuient sur une mesure ancienne et peuvent ne plus correspondre à l'état réel du sol. " +
        "Vérifiez l'alimentation solaire, la batterie et la couverture Wi-Fi du boîtier.",
      fondement: [
        `Dernier relevé il y a ${un(age / 3600, 1)} h`,
        `Batterie au dernier contact : ${un(d.batteryPct)} %`,
      ],
    });
  }

  // --- Irrigation : la décision principale ------------------------------
  const pluie = pluieProche(ctx.meteo);
  const pente = tendanceHumidite(ctx.historique);

  if (d.soilMoisturePct < seuilHumidite) {
    const manque = seuilHumidite - d.soilMoisturePct;
    if (pluie) {
      out.push({
        id: "irrigation-attendre-pluie",
        priorite: "important",
        titre: "Sol sec, mais pluie annoncée : attendre",
        detail:
          `Le sol est ${un(manque)} points sous le seuil, mais de la pluie est prévue le ${pluie.date}. ` +
          "Irriguer maintenant reviendrait à gaspiller de l'eau et à risquer un excès. Contrôlez à nouveau après l'averse ; " +
          "si elle ne tombe pas, irriguez.",
        fondement: [
          `Humidité du sol : ${un(d.soilMoisturePct)} % (seuil ${ctx.culture} en ${LIBELLE_STADE[stade]} : ${seuilHumidite} %)`,
          `Pluie prévue le ${pluie.date} : ${un(pluie.pluieMm, 1)} mm`,
        ],
      });
    } else {
      const urgent = manque >= 10;
      out.push({
        id: "irrigation-necessaire",
        priorite: urgent ? "urgent" : "important",
        titre: urgent ? "Irriguer maintenant" : "Irrigation à prévoir",
        detail:
          `Le sol est ${un(manque)} points sous le seuil de la culture et aucune pluie utile n'est annoncée sous 48 h. ` +
          (ctx.irrigation.irrigationMode === "auto"
            ? "Le mode automatique devrait déclencher la pompe ; vérifiez qu'elle tourne effectivement."
            : "Vous êtes en pilotage manuel : démarrez la pompe depuis l'accueil."),
        fondement: [
          `Humidité du sol : ${un(d.soilMoisturePct)} % (seuil ${ctx.culture} en ${LIBELLE_STADE[stade]} : ${seuilHumidite} %)`,
          "Aucune pluie ≥ 5 mm prévue sous 48 h",
          `Mode d'irrigation : ${ctx.irrigation.irrigationMode}`,
        ],
      });
    }
  } else if (d.soilMoisturePct > seuils.humiditeMax) {
    out.push({
      id: "sol-detrempe",
      priorite: "important",
      titre: "Sol détrempé : arrêter l'irrigation",
      detail:
        "Au-delà de ce niveau, les racines manquent d'oxygène et les maladies fongiques s'installent. " +
        "Coupez l'irrigation et vérifiez le drainage de la parcelle.",
      fondement: [`Humidité du sol : ${un(d.soilMoisturePct)} % (maximum conseillé : ${seuils.humiditeMax} %)`],
    });
  } else if (ctx.irrigation.irrigationMode === "manuel" && ctx.irrigation.pumpManualOn) {
    out.push({
      id: "pompe-inutile",
      priorite: "important",
      titre: "La pompe tourne alors que le sol est suffisamment humide",
      detail: "Arrêtez la pompe : continuer consomme de l'eau et de l'énergie sans bénéfice pour la culture.",
      fondement: [
        `Humidité du sol : ${un(d.soilMoisturePct)} % (seuil : ${seuilHumidite} %)`,
        "Pompe en marche, mode manuel",
      ],
    });
  }

  // Assèchement rapide : prévenir avant d'être sous le seuil.
  if (pente !== null && pente <= -3 && d.soilMoisturePct >= seuilHumidite) {
    const joursRestants = (d.soilMoisturePct - seuilHumidite) / -pente;
    out.push({
      id: "assechement-rapide",
      priorite: "info",
      titre: "Le sol s'assèche vite",
      detail:
        `Au rythme actuel, le seuil d'irrigation sera atteint dans environ ${un(Math.max(0, joursRestants), 1)} jour(s). ` +
        "Prévoyez l'eau nécessaire, surtout si le réservoir est bas.",
      fondement: [
        `Tendance sur les derniers jours : ${un(pente, 1)} point(s) d'humidité par jour`,
        `Humidité actuelle : ${un(d.soilMoisturePct)} %`,
      ],
    });
  }

  // --- Réserve d'eau ----------------------------------------------------
  if (d.waterLevelPct < 20) {
    out.push({
      id: "reservoir-bas",
      priorite: d.waterLevelPct < 10 ? "urgent" : "important",
      titre: "Réservoir presque vide",
      detail:
        "Remplissez la réserve avant la prochaine irrigation, sinon la pompe tournera à sec et peut être endommagée.",
      fondement: [`Niveau d'eau : ${un(d.waterLevelPct)} %`],
    });
  }

  // --- pH du sol --------------------------------------------------------
  if (d.soilPh > 0 && d.soilPh < seuils.phMin) {
    out.push({
      id: "ph-acide",
      priorite: "info",
      titre: "Sol trop acide pour cette culture",
      detail:
        "Un chaulage (chaux agricole ou cendre de bois bien répartie) avant le prochain cycle relèvera le pH. " +
        "En sol acide, la plante absorbe mal le phosphore même s'il est présent.",
      fondement: [`pH mesuré : ${un(d.soilPh, 1)} (plage conseillée ${ctx.culture} : ${seuils.phMin}–${seuils.phMax})`],
    });
  } else if (d.soilPh > seuils.phMax) {
    out.push({
      id: "ph-basique",
      priorite: "info",
      titre: "Sol trop basique pour cette culture",
      detail:
        "Un apport de matière organique bien décomposée (compost, fumier mûr) fera baisser le pH progressivement. " +
        "En sol basique, le fer et le zinc deviennent peu disponibles : surveillez les jaunissements entre les nervures.",
      fondement: [`pH mesuré : ${un(d.soilPh, 1)} (plage conseillée ${ctx.culture} : ${seuils.phMin}–${seuils.phMax})`],
    });
  }

  // --- Fertilisation ----------------------------------------------------
  if (ctx.npk && ctx.npk.nitrogenMgKg > 0 && ctx.npk.nitrogenMgKg < seuils.azoteMin) {
    out.push({
      id: "azote-faible",
      priorite: stade === "croissance" ? "important" : "info",
      titre: "Azote insuffisant",
      detail:
        (stade === "croissance"
          ? "La culture est en pleine croissance, c'est le moment où le manque d'azote coûte le plus de rendement. "
          : "") +
        "Un apport azoté fractionné, suivi d'un arrosage pour le faire descendre aux racines, est indiqué. " +
        "Signe à surveiller : jaunissement des vieilles feuilles en premier.",
      fondement: [
        `Azote : ${un(ctx.npk.nitrogenMgKg)} mg/kg (minimum conseillé : ${seuils.azoteMin} mg/kg)`,
        `Stade : ${LIBELLE_STADE[stade]} (jour ${jours})`,
      ],
    });
  }

  // --- Chaleur ----------------------------------------------------------
  if (d.temperatureC > seuils.tempMax) {
    out.push({
      id: "chaleur-excessive",
      priorite: "info",
      titre: "Température au-dessus du confort de la culture",
      detail:
        "Irriguez tôt le matin ou en fin de journée plutôt qu'en plein soleil, et maintenez un paillage : " +
        "il limite l'évaporation et la température du sol.",
      fondement: [`Température : ${un(d.temperatureC, 1)} °C (au-delà de ${seuils.tempMax} °C, ${ctx.culture} souffre)`],
    });
  }

  // --- Énergie ----------------------------------------------------------
  if (d.batteryPct > 0 && d.batteryPct < 25) {
    out.push({
      id: "batterie-faible",
      priorite: "important",
      titre: "Batterie du boîtier faible",
      detail:
        "Nettoyez le panneau solaire et vérifiez qu'aucune ombre ne le couvre en journée. " +
        "Sans énergie, le boîtier cesse de mesurer et l'irrigation automatique s'arrête.",
      fondement: [`Batterie : ${un(d.batteryPct)} %`],
    });
  }

  // --- Sécurité de la parcelle ------------------------------------------
  const recentes = ctx.alertes.filter((a) => maintenant - a.timestamp < 48 * 3600);
  const mouvements = recentes.filter((a) => a.type === "mouvement").length;
  if (mouvements >= 3) {
    out.push({
      id: "intrusions-repetees",
      priorite: "important",
      titre: "Passages répétés détectés",
      detail:
        "Plusieurs détections en 48 h : contrôlez la clôture et l'état des cultures en bordure. " +
        "S'il s'agit d'animaux, un renforcement du grillage sur la zone concernée est plus efficace qu'une surveillance.",
      fondement: [`${mouvements} détections de mouvement sur les 48 dernières heures`],
    });
  }
  if (recentes.some((a) => a.type === "alarme")) {
    out.push({
      id: "alarme-recente",
      priorite: "urgent",
      titre: "Alarme déclenchée récemment",
      detail: "Rendez-vous sur la parcelle pour constater, puis marquez l'alerte comme traitée dans l'application.",
      fondement: ["Alerte de type « alarme » sur les 48 dernières heures"],
    });
  }

  // --- Rien à signaler --------------------------------------------------
  if (out.length === 0) {
    out.push({
      id: "rien-a-signaler",
      priorite: "info",
      titre: "Rien à signaler",
      detail:
        "Les mesures sont dans les plages attendues pour cette culture à ce stade. Poursuivez la surveillance habituelle.",
      fondement: [
        `Humidité du sol : ${un(d.soilMoisturePct)} % (seuil : ${seuilHumidite} %)`,
        `Réservoir : ${un(d.waterLevelPct)} %`,
        `Stade : ${stade} (jour ${jours})`,
      ],
    });
  }

  const ordre: Record<Priorite, number> = { urgent: 0, important: 1, info: 2 };
  return out.sort((a, b) => ordre[a.priorite] - ordre[b.priorite]);
}
