// ============================================================
// Parcelle courante.
//
// Toutes les données appartiennent à une parcelle : chaque écran lit ici
// laquelle est sélectionnée. Le choix est mémorisé sur l'appareil, pour
// qu'un agriculteur qui gère plusieurs parcelles retrouve la sienne à la
// réouverture.
// ============================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
// expo-secure-store plutôt qu'AsyncStorage : déjà présent dans le build
// natif (il stocke le jeton de session), donc aucune recompilation.
import * as SecureStore from "expo-secure-store";
import { listParcels } from "@/services/api";
import { ParcelInfo, Role } from "@/services/types";
import { useAuth } from "@/auth/AuthContext";

const STORAGE_KEY = "rx35_parcelle_courante";

export type ParcelWithRole = ParcelInfo & { role: Role };

interface ParcelContextValue {
  parcels: ParcelWithRole[];
  current: ParcelWithRole | null;
  isLoading: boolean;
  error: string | null;
  select: (parcelId: string) => void;
  refresh: () => Promise<void>;
  /** true si le rôle courant autorise à piloter (pas un observateur). */
  canControl: boolean;
}

const ParcelContext = createContext<ParcelContextValue | undefined>(undefined);

export function ParcelProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [parcels, setParcels] = useState<ParcelWithRole[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listParcels();
      setParcels(list);
      setError(null);

      // Restaure le dernier choix s'il existe toujours (une parcelle peut
      // avoir été retirée par le propriétaire entre deux ouvertures).
      const memorise = await SecureStore.getItemAsync(STORAGE_KEY);
      setCurrentId((actuel) => {
        const valide = (id: string | null) => id && list.some((p) => p.id === id);
        if (valide(actuel)) return actuel;
        if (valide(memorise)) return memorise;
        return list[0]?.id ?? null;
      });
    } catch (err: any) {
      setError(err?.message ?? "Impossible de charger vos parcelles.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setParcels([]);
      setCurrentId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    refresh();
  }, [isAuthenticated, refresh]);

  const select = useCallback((parcelId: string) => {
    setCurrentId(parcelId);
    SecureStore.setItemAsync(STORAGE_KEY, parcelId).catch(() => {
      // Mémorisation best-effort : l'app reste utilisable sans.
    });
  }, []);

  const current = parcels.find((p) => p.id === currentId) ?? null;

  return (
    <ParcelContext.Provider
      value={{
        parcels,
        current,
        isLoading,
        error,
        select,
        refresh,
        canControl: current?.role === "proprietaire" || current?.role === "membre",
      }}
    >
      {children}
    </ParcelContext.Provider>
  );
}

export function useParcel() {
  const ctx = useContext(ParcelContext);
  if (!ctx) throw new Error("useParcel doit être utilisé à l'intérieur de <ParcelProvider>");
  return ctx;
}
