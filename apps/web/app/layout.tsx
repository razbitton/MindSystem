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
const faviconScript = `(function(){try{var lightBrowserIcon="/brand/mindsystem-logo-dark.png?v=20260621";var darkBrowserIcon="/brand/mindsystem-logo-light.png?v=20260621";var media=window.matchMedia("(prefers-color-scheme: dark)");function setIcon(){var link=document.querySelector("link[data-mindsystem-favicon]");if(!link){link=document.createElement("link");link.rel="icon";link.type="image/png";link.setAttribute("data-mindsystem-favicon","true");document.head.appendChild(link);}var next=media.matches?darkBrowserIcon:lightBrowserIcon;if(link.getAttribute("href")!==next){link.setAttribute("href",next);}}setIcon();if(media.addEventListener){media.addEventListener("change",setIcon);}else if(media.addListener){media.addListener(setIcon);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="light" className={`${inter.variable} ${jetbrainsMono.variable} bg-background`} suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          type="image/png"
          href="/brand/mindsystem-logo-dark.png?v=20260621"
          data-mindsystem-favicon="true"
        />
        <link rel="apple-touch-icon" href="/brand/mindsystem-logo-dark.png" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: faviconScript }} />
      </head>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
