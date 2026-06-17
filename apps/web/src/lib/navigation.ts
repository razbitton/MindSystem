import {
  Bot,
  ClipboardCheck,
  Database,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  Search,
  Settings,
  StickyNote,
  type LucideIcon
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

/**
 * Primary navigation. Agents + Schemas are intentionally NOT here — they live in
 * Settings (kept accessible, not front-and-center) per the calm, consumer-first redesign.
 */
export const navSections: NavSection[] = [
  {
    labelKey: "nav.workspace",
    items: [
      { href: "/dashboard", labelKey: "nav.home", icon: Home },
      { href: "/inbox", labelKey: "nav.inbox", icon: Inbox },
      { href: "/search", labelKey: "nav.search", icon: Search }
    ]
  },
  {
    labelKey: "nav.library",
    items: [
      { href: "/notes", labelKey: "nav.notes", icon: StickyNote },
      { href: "/tasks", labelKey: "nav.tasks", icon: ClipboardCheck },
      { href: "/projects", labelKey: "nav.projects", icon: FolderKanban },
      { href: "/documents", labelKey: "nav.documents", icon: FileText }
    ]
  },
  {
    labelKey: "nav.review",
    items: [{ href: "/review", labelKey: "nav.review", icon: Database }]
  }
];

/** Settings destinations — reachable, but tucked into the sidebar footer / palette. */
export const settingsNav: NavItem[] = [
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/agents", labelKey: "nav.agents", icon: Bot },
  { href: "/admin/schemas", labelKey: "nav.schemas", icon: Database }
];

export const allNavItems: NavItem[] = [
  ...navSections.flatMap((section) => section.items),
  ...settingsNav
];
