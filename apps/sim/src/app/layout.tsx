import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raptee Ops Agent - Simulated Alexa+ Echo Show",
  description: "Simulated Alexa+ Echo Show web app for Raptee.HV, backed by a real self-hosted MCP server."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
