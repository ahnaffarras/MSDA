import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import ClientLayout from "@/components/ClientLayout";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--f-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--f-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MSDA — MikroTik Smart DNS Analytics",
  description:
    "Monitor DNS traffic per access point across labs and classrooms, for teachers and network administrators.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1020" },
  ],
};

/**
 * Dijalankan sebelum React hydrate supaya tema tersimpan langsung terpasang
 * (tanpa kedip terang → gelap). Default mengikuti pengaturan sistem.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('msda-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t)}catch(e){document.documentElement.classList.add('light')}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
