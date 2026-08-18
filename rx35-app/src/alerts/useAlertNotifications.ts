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

// Les alertes justifient d'interrompre : intrusion, niveau d'eau critique.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const INTERVALLE_MS = 60_000;

const TITRES: Record<AlertItem["type"], string> = {
  mouvement: "Mouvement détecté",
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
          await Notifications.scheduleNotificationAsync({
            content: {
              title: TITRES[a.type],
              body: nomParcelle ? `${nomParcelle} — ${a.message}` : a.message,
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

    const timer = setInterval(verifier, INTERVALLE_MS);
    // Un retour au premier plan est le moment où l'agriculteur veut savoir.
    const sub = AppState.addEventListener("change", (etat) => {
      if (etat === "active") verifier();
    });

    return () => {
      actif = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [parcelId, nomParcelle]);
}
