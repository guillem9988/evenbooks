import { BanknoteIcon, FileTextIcon, HouseIcon, LandmarkIcon, PackageIcon, ReceiptIcon, RepeatIcon, ScaleIcon, SettingsIcon, UsersIcon } from "lucide-react";

export interface NavLink {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export const NAV_GROUPS: Array<{ labelKey: string | null; links: NavLink[] }> = [
  {
    labelKey: null,
    links: [{ href: "/", labelKey: "nav.home", icon: HouseIcon }],
  },
  {
    labelKey: "nav.groupSales",
    links: [
      { href: "/ingressos", labelKey: "nav.income", icon: BanknoteIcon },
      { href: "/pressupostos", labelKey: "nav.quotes", icon: FileTextIcon },
      { href: "/recurrents", labelKey: "nav.recurring", icon: RepeatIcon },
      { href: "/cataleg", labelKey: "nav.catalog", icon: PackageIcon },
    ],
  },
  {
    labelKey: "nav.groupPurchases",
    links: [
      { href: "/despeses", labelKey: "nav.expenses", icon: ReceiptIcon },
      { href: "/banc", labelKey: "nav.bank", icon: LandmarkIcon },
    ],
  },
  {
    labelKey: "nav.groupManage",
    links: [
      { href: "/impostos", labelKey: "nav.taxes", icon: ScaleIcon },
      { href: "/contactes", labelKey: "nav.contacts", icon: UsersIcon },
      { href: "/configuracio", labelKey: "nav.settings", icon: SettingsIcon },
    ],
  },
];

export const ALL_NAV_LINKS = NAV_GROUPS.flatMap((group) => group.links);

/** Quick-create shortcuts. Each page opens its creation dialog when it sees the query flag. */
export const CREATE_LINKS: NavLink[] = [
  { href: "/ingressos?nova=1", labelKey: "home.newInvoice", icon: BanknoteIcon },
  { href: "/pressupostos?nou=1", labelKey: "home.newQuote", icon: FileTextIcon },
  { href: "/despeses?nova=1", labelKey: "home.newExpense", icon: ReceiptIcon },
  { href: "/banc?importa=1", labelKey: "home.importBank", icon: LandmarkIcon },
];
