import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { LocaleProvider } from "../src/i18n";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "MindSystem",
  description:
    "Capture-first personal knowledge workspace with notes, tasks, projects, documents, agents, and English/Hebrew support."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e13" }
  ]
};

const themeScript = `(function(){try{var t=localStorage.getItem("mindsystem.theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;var l=localStorage.getItem("mindsystem.locale");if(l==="he"){document.documentElement.lang="he";document.documentElement.dir="rtl";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="light" className={`${inter.variable} ${jetbrainsMono.variable} bg-background`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
