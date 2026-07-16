import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const heading = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Luca — Gestione contenuti",
  description: "Pianificazione, pubblicazione e KPI dei contenuti.",
  // iOS: abilita la modalità standalone quando aggiunta alla Home Screen.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Contenuti",
  },
};

// Theme-color della chrome del browser in standalone + safe-area iPhone (notch).
// App a tema solo chiaro → un'unica tinta chiara (paper).
export const viewport: Viewport = {
  themeColor: "#fffdf8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${sans.variable} ${heading.variable} ${mono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: estensioni browser (es. Grammarly) iniettano attributi
          data-* nel <body> prima dell'hydration → warning benigno da silenziare. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              borderRadius: "16px",
              border: "1px solid #E6DCCB",
              background: "#FFFDF8",
              color: "#1A1813",
            },
          }}
        />
      </body>
    </html>
  );
}
