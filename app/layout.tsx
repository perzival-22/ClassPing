import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClassPing — never miss a class or a deadline",
  description:
    "Your classes and deadlines, right on time. A friendly timetable + reminders app for students.",
};

export const viewport: Viewport = {
  themeColor: "#5b54e8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fredoka.variable}>
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
