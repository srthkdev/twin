import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Twin — every neighbourhood has a twin",
  description: "Find any neighbourhood's cultural twin in another city using Qloo taste data, corrected for popularity bias.",
};
export const viewport: Viewport = { themeColor: "#07080b", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body>
        <TooltipProvider delayDuration={150}>
          <Nav />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
