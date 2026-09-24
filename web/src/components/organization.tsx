"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ORG_KEY } from "@/lib/api";

const NAME_KEY = "matchinvoice-organization-name";

interface OrganizationState {
  ready: boolean;
  organizationId: string;
  organizationName: string;
  select: (id: string, name: string) => void;
  clear: () => void;
}

const OrganizationContext = createContext<OrganizationState | null>(null);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  useEffect(() => {
    setOrganizationId(window.localStorage.getItem(ORG_KEY) ?? "");
    setOrganizationName(window.localStorage.getItem(NAME_KEY) ?? "");
    setReady(true);
  }, []);

  const select = useCallback((id: string, name: string) => {
    window.localStorage.setItem(ORG_KEY, id);
    window.localStorage.setItem(NAME_KEY, name);
    setOrganizationId(id);
    setOrganizationName(name);
  }, []);

  const clear = useCallback(() => {
    window.localStorage.removeItem(ORG_KEY);
    window.localStorage.removeItem(NAME_KEY);
    setOrganizationId("");
    setOrganizationName("");
  }, []);

  return (
    <OrganizationContext.Provider value={{ ready, organizationId, organizationName, select, clear }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization(): OrganizationState {
  const value = useContext(OrganizationContext);
  if (value === null) {
    throw new Error("useOrganization must be used inside OrganizationProvider");
  }
  return value;
}
