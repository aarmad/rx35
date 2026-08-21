// ============================================================
// Notifications d'alerte (cahier §10 : « notification immédiate sur
// l'application mobile »).
//
// LIMITE ASSUMÉE : ce sont des notifications LOCALES. L'application
// interroge le serveur pendant qu'elle tourne et déclenche une
// notification système quand une alerte inconnue apparaît. Elle ne
// réveille donc pas un téléphone dont l'app est fermée depuis longtemps —
// cela exigerait un projet Firebase et de vraies notifications push.
//
// Ce qui est couvert : l'agriculteur qui a l'app ouverte ou en arrière-plan
// récent est prévenu sans avoir à surveiller l'écran des alertes.
// ============================================================
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { getAlerts } from "@/services/api";
import { AlertItem } from "@/services/types";

// Alertes graduées (rapport de test, §4) : toutes les détections ne se
// valent pas. Réveiller quelqu'un la nuit pour une chèvre le pousserait à
// couper les notifications — et il raterait la vraie intrusion.
//   CRITIQUE     : son + priorité haute (présence humaine, alarme, eau)
//   INFORMATIVE  : silencieuse (passage d'animal, information)
type Gravite = "critique" | "informative";

const GRAVITE: Record<AlertItem["type"], Gravite> = {
  presence_humaine: "critique",
  alarme: "critique",
  niveau_eau: "critique",
  badge_refuse: "critique",
  // Un PIR seul ne sait pas ce qu'il a vu : dans le doute on prévient
  // franchement, quitte à ce que ce ne soit qu'un animal.
  mouvement: "critique",
  passage_animal: "informative",
  info: "informative",
};

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const critique = n.request.content.data?.gravite !== "informative";
    return {
      shouldShowAlert: true,
      shouldPlaySound: critique,
      shouldSetBadge: false,
    };
  },
});

// 15 s, comme demandé au rapport de test. Le sondage s'arrête dès que
// l'application quitte le premier plan (voir plus bas).
const INTERVALLE_MS = 15_000;

const TITRES: Record<AlertItem["type"], string> = {
  mouvement: "Mouvement détecté",
  presence_humaine: "Présence humaine sur la parcelle",
  passage_animal: "Passage d'animal",
  niveau_eau: "Niveau d'eau critique",
  alarme: "Alarme déclenchée",
  badge_refuse: "Badge refusé",
  info: "RX35",
};

export function useAlertNotifications(parcelId: string | null, nomParcelle?: string) {
  // Les alertes déjà notifiées, pour ne pas sonner deux fois. Au premier
  // passage on enregistre l'existant sans notifier : ouvrir l'app ne doit
  // pas déclencher une rafale de notifications pour de vieux événements.
  const connues = useRef<Set<string> | null>(null);

  useEffect(() => {
    connues.current = null;
    if (!parcelId) return;

    let actif = true;

    const verifier = async () => {
      try {
        const alertes = await getAlerts(parcelId);
        if (!actif) return;

        if (connues.current === null) {
          connues.current = new Set(alertes.map((a) => a.id));
          return;
        }

        const nouvelles = alertes.filter((a) => !connues.current!.has(a.id) && !a.lu);
        for (const a of nouvelles) {
          connues.current.add(a.id);
          const gravite = GRAVITE[a.type] ?? "critique";
          await Notifications.scheduleNotificationAsync({
            content: {
              title: TITRES[a.type],
              body: nomParcelle ? `${nomParcelle} — ${a.message}` : a.message,
              data: { gravite },
              sound: gravite === "critique",
              priority:
                gravite === "critique"
                  ? Notifications.AndroidNotificationPriority.HIGH
                  : Notifications.AndroidNotificationPriority.LOW,
            },
            trigger: null, // immédiat
          });
        }
        // Les alertes lues ailleurs entrent quand même dans le "déjà vu".
        alertes.forEach((a) => connues.current!.add(a.id));
      } catch {
        // Hors connexion : on réessaiera au prochain tour.
      }
    };

    (async () => {
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) {
        const demande = await Notifications.requestPermissionsAsync();
        if (!demande.granted) return; // refus explicite : on n'insiste pas
      }
      verifier();
    })();

    let timer: ReturnType<typeof setInterval> | null = null;
    const demarrer = () => {
      if (!timer) timer = setInterval(verifier, INTERVALLE_MS);
    };
    const arreter = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    demarrer();

    const sub = AppState.addEventListener("change", (etat) => {
      if (etat === "active") {
        // Un retour au premier plan est le moment où l'agriculteur veut savoir.
        verifier();
        demarrer();
      } else {
        // En arrière-plan, sonder toutes les 15 s viderait la batterie sans
        // que personne ne regarde. Ces notifications sont locales : elles ne
        // fonctionnent que lorsque l'application tourne (voir l'en-tête).
        arreter();
      }
    });

    return () => {
      actif = false;
      arreter();
      sub.remove();
    };
  }, [parcelId, nomParcelle]);
}
