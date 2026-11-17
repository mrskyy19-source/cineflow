import type { Metadata, Viewport } from "next"; import { Inter } from "next/font/google"; import "./globals.css"; import { Providers } from "./providers";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata: Metadata = { title: "CineFlow — AI Post-Production Autopilot", description: "From wrap to viral in 90 seconds.", keywords: ["video editing", "AI video", "post production"] };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" }] };
export default function RootLayout({ children }: { children: React.ReactNode }) { return (<html lang="en" suppressHydrationWarning className={inter.variable}><body className="min-h-screen bg-background font-sans antialiased"><Providers>{children}</Providers></body></html>); }
