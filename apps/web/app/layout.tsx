import type { Metadata } from "next";
import { AppShell } from "../src/app-shell";
import { LocaleProvider } from "../src/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Context OS | מערכת ההקשר האישית",
  description: "Self-hosted personal context and task orchestration with English and Hebrew support. מערכת אישית לניהול הקשר, משימות וסוכני AI בעברית ובאנגלית."
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
