"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface SessionUser {
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
  emailVerified?: boolean;
  hasPassword?: boolean;
  organizations: Array<{ id: string; legalName: string }>;
}

interface OrganizationState {
  ready: boolean;
  organizationId: string;
  organizationName: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  /** False until the person confirms their address; AI reading and sending emails wait for it. */
  emailVerified: boolean;
  /** False for Google-only accounts, which confirm sensitive actions by typing their email instead. */
  hasPassword: boolean;
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
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(true);
  const [hasPassword, setHasPassword] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await api<SessionUser>("/auth/session");
      const organization = session.organizations[0];
      setDisplayName(session.displayName);
      setEmail(session.email ?? "");
      setAvatarUrl(session.avatarUrl ?? null);
      // Older APIs don't report it; treat that as verified so nothing gets blocked in the UI.
      setEmailVerified(session.emailVerified ?? true);
      setHasPassword(session.hasPassword ?? true);
      setOrganizationId(organization?.id ?? "");
      setOrganizationName(organization?.legalName ?? "");
      return true;
    } catch {
      setDisplayName("");
      setEmail("");
      setAvatarUrl(null);
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
    setEmail("");
    setAvatarUrl(null);
    setOrganizationId("");
    setOrganizationName("");
  }, []);

  return (
    <OrganizationContext.Provider value={{ ready, organizationId, organizationName, displayName, email, avatarUrl, emailVerified, hasPassword, select, refresh, clear }}>
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
