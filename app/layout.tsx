import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeBootstrap } from "@/components/shell/ThemeBootstrap";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Hindsight Sandbox — Agent Memory Orchestration, Open Source",
    template: "%s · Hindsight Sandbox",
  },
  description:
    "An open-source Next.js App Router sandbox for mounting, wiring and orchestrating agent-memory apps: Memory, Prompt Engineering, Context Tuning and Continuous Learning — with Tier-1 dashboards, node graphs and benchmarks. UI-inspired by hindsight.vectorize.io.",
  keywords: ["agent memory", "hindsight", "orchestration", "sandbox", "nextjs", "open source", "retain recall reflect"],
  openGraph: {
    title: "Hindsight Sandbox",
    description: "Mount, wire and orchestrate agent-memory apps in your browser.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07070c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable}`}>
      <head>
        <ThemeBootstrap />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
