import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Seal Team BD",
  description: "Business Development Platform — Cushman & Wakefield",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolve the signed-in user once, server-side. The sidebar (and thus the app
  // chrome) only renders for authenticated users; the /login route renders
  // standalone. Guarded so a missing/placeholder Supabase config can't crash the
  // whole tree during local dev or build.
  let userEmail: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
  } catch {
    userEmail = null;
  }

  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full flex bg-background antialiased">
        {userEmail && <Sidebar userEmail={userEmail} />}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
