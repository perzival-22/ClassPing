import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

/**
 * Absolute origin for metadata. Without `metadataBase`, Next can't resolve the
 * generated OG image to an absolute URL and social platforms silently show no
 * card at all. Mirrors the resolution order in lib/email.ts.
 */
const siteUrl =
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://classping.space");

const TITLE = "ClassPing — never miss a class or a deadline";
const DESCRIPTION =
  "Your classes and deadlines, right on time. A friendly timetable and reminder app for students — see today at a glance, track every assignment, and get nudged before it's due.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "ClassPing",
  keywords: [
    "student planner",
    "class timetable",
    "assignment tracker",
    "homework reminders",
    "school schedule app",
    "study planner",
  ],
  // Every route but "/" is behind auth, so there is nothing else worth
  // crawling — but the landing page itself should index and unfurl properly.
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "ClassPing",
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: "ClassPing",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#5b54e8",
  width: "device-width",
  initialScale: 1,
  // No maximumScale: pinning zoom to 1 blocks pinch-zoom, a WCAG 1.4.4
  // failure — low-vision users need to magnify.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={fredoka.variable}>
        <body>
          <StoreProvider>{children}</StoreProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
