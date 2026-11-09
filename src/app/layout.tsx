import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { QueryProvider } from "@/lib/queryClient";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
// Inter is self-hosted (like Geist) so the production build never fetches
// Google Fonts: a cut-short Google response crashed next/font's loader and
// failed the deploy. The file is Google Fonts' Inter v20 "latin" subset
// (variable weight, SIL Open Font License 1.1) — the subset this used to
// preload; other scripts fall back to the system sans stack.
const inter = localFont({
  src: "./fonts/InterLatinVF.woff2",
  variable: "--font-inter",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ZSMS — Zippro School Management System",
  description: "Run your entire school from one place, by Zippro System Limited.",
  icons: { icon: "/favicon.png" },
};

// Applies the persisted theme before paint, so toggling dark mode in the
// header user menu doesn't flash light-then-dark on the next page load.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('zsms-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
