import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "项目经营管理中台 P0",
  description: "项目排期与建模排期 P0 工程版",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
