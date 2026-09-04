"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderKanban, Star, Trash2, Settings, Users, KeyRound, Sparkles } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "홈", icon: Home },
  { href: "/projects", label: "모든 프로젝트", icon: FolderKanban },
  { href: "/projects/starred", label: "즐겨찾기", icon: Star },
  { href: "/meetings", label: "기획실", icon: Users },
  { href: "/projects/trash", label: "휴지통", icon: Trash2 },
];
const BOTTOM = [
  { href: "/settings/mcp", label: "MCP · API 키", icon: KeyRound },
  { href: "/settings", label: "설정", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  if (path.startsWith("/share/")) return null;
  const inEditor = path.startsWith("/p/");
  return (
    <aside className={clsx("h-full shrink-0 border-r bg-panel flex flex-col transition-all", inEditor ? "w-14" : "w-56")}>
      <Link href="/" className="flex items-center gap-2 px-4 h-14 border-b font-semibold">
        <Sparkles size={18} className="text-accent shrink-0" />
        {!inEditor && <span>PlanFast</span>}
      </Link>
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV.map((n) => (
          <Item key={n.href} {...n} active={path === n.href} compact={inEditor} />
        ))}
      </nav>
      <div className="p-2 border-t space-y-0.5">
        {BOTTOM.map((n) => (
          <Item key={n.href} {...n} active={path.startsWith(n.href) && (n.href !== "/settings" || path === "/settings")} compact={inEditor} />
        ))}
      </div>
    </aside>
  );
}

function Item({ href, label, icon: Icon, active, compact }: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; active: boolean; compact: boolean }) {
  return (
    <Link
      href={href}
      title={label}
      className={clsx("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.05]", active && "bg-accent-soft text-accent font-medium", compact && "justify-center")}
    >
      <Icon size={16} />
      {!compact && <span>{label}</span>}
    </Link>
  );
}
