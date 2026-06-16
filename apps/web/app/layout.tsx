import type { Metadata } from "next";
import { AppShell } from "../src/app-shell";
import { LocaleProvider } from "../src/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindSystem",
  description: "Capture-first personal knowledge workspace with notes, tasks, projects, documents, agents, and English/Hebrew support."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
