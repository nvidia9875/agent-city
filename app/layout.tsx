import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentTown",
  description: "災害対応リハーサルのエージェント可視化デモ。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
