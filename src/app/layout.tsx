import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { appSettings } from "@/lib/repo";

export const metadata: Metadata = { title: "PlanFast", description: "AI 기획 에디터 (로컬)" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = appSettings.get().theme;
  return (
    <html lang="ko" className={theme === "dark" ? "dark h-full" : "h-full"} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        {theme === "system" && (
          <script dangerouslySetInnerHTML={{ __html: `if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')` }} />
        )}
      </head>
      <body className="h-full flex">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
