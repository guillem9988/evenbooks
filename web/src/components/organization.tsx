"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface SessionUser {
  displayName: string;
  organizations: Array<{ id: string; legalName: string }>;
}

interface OrganizationState {
  ready: boolean;
  organizationId: string;
  organizationName: string;
  displayName: string;
  select: (id: string, name: string) => void;
  refresh: () => Promise<boolean>;
  clear: () => void;
}

const OrganizationContext = createContext<OrganizationState | null>(null);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [displayName, setDisplayName] = useState("");

  const refresh = useCallback(async () => {
    try {
      const session = await api<SessionUser>("/auth/session");
      const organization = session.organizations[0];
      setDisplayName(session.displayName);
      setOrganizationId(organization?.id ?? "");
      setOrganizationName(organization?.legalName ?? "");
      return true;
    } catch {
      setDisplayName("");
      setOrganizationId("");
      setOrganizationName("");
      return false;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback((id: string, name: string) => {
    setOrganizationId(id);
    setOrganizationName(name);
  }, []);

  const clear = useCallback(() => {
    setDisplayName("");
    setOrganizationId("");
    setOrganizationName("");
  }, []);

  return (
    <OrganizationContext.Provider value={{ ready, organizationId, organizationName, displayName, select, refresh, clear }}>
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
