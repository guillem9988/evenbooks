"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOrganization } from "@/components/organization";
import { AuthScreen } from "@/components/auth-screen";

export default function RegisterPage() {
  const { ready, organizationId } = useOrganization();
  const router = useRouter();

  useEffect(() => {
    if (ready && organizationId) {
      router.replace("/");
    }
  }, [ready, organizationId, router]);

  if (!ready) return null;
  if (!organizationId) {
    return <AuthScreen initialMode="register" />;
  }
  return null;
}
