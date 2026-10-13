import type { Metadata } from "next";
import { TermsOfUse } from "@/components/privacy-policy";

export const metadata: Metadata = { title: "Condicions d’ús · Evenbooks" };

export default function TermsPage() {
  return <TermsOfUse />;
}
