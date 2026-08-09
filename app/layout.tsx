import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/500.css";
import "@fontsource/fira-sans/600.css";
import "@fontsource/fira-sans/700.css";
import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { isScrapingAdmin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/supabase";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar de Estágios",
  description: "Vagas de estágio em Dados, IA e Machine Learning, reunidas diariamente.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#f4f2eb",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getOptionalUser();
  const shellUser = user ? { email: user.email || "", name: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Conta" } : null;
  return (
    <html lang="pt-BR">
      <body><AppShell user={shellUser} admin={isScrapingAdmin(user)} demo={!hasDatabaseConfig()}>{children}</AppShell></body>
    </html>
  );
}
