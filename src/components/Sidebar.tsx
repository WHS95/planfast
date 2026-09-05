"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderKanban, Star, Trash2, Settings, Users, KeyRound, Sparkles } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
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
  const reduce = useReducedMotion();
  if (path.startsWith("/share/")) return null;
  // 에디터에서는 56px 로 접힌다(툴팁으로 라벨 표시). hover 로 펼쳐지지는 않는다.
  const inEditor = path.startsWith("/p/");
  return (
    <aside className={clsx("h-full shrink-0 border-r bg-panel flex flex-col transition-[width] duration-200 ease-out", inEditor ? "w-14" : "w-56")}>
      <Link href="/" title="PlanFast" className={clsx("flex items-center gap-2 h-14 border-b font-semibold shrink-0", inEditor ? "justify-center px-0" : "px-4")}>
        <Sparkles size={18} className="text-accent shrink-0" />
        {!inEditor && <span>PlanFast</span>}
      </Link>
      <LayoutGroup id="pf-sidebar">
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((n) => (
            <Item key={n.href} {...n} active={path === n.href} compact={inEditor} reduce={!!reduce} />
          ))}
        </nav>
        <div className="p-2 border-t space-y-0.5">
          {BOTTOM.map((n) => (
            <Item key={n.href} {...n} active={path.startsWith(n.href) && (n.href !== "/settings" || path === "/settings")} compact={inEditor} reduce={!!reduce} />
          ))}
        </div>
      </LayoutGroup>
    </aside>
  );
}

function Item({ href, label, icon: Icon, active, compact, reduce }: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; active: boolean; compact: boolean; reduce: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={compact ? label : undefined}
      className={clsx(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        active ? "text-accent font-medium" : "text-fg/80 hover:text-fg hover:bg-[var(--hover)]",
        compact && "justify-center",
      )}
    >
      {active && (
        <motion.span
          layoutId="pf-nav-pill"
          className="absolute inset-0 rounded-md bg-accent-soft"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42, mass: 0.6 }}
        />
      )}
      <Icon size={16} />
      {!compact && <span className="relative truncate">{label}</span>}
      {compact && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md border bg-panel px-2 py-1 text-xs text-fg opacity-0 translate-x-[-4px] shadow-[var(--shadow-2)] transition-[opacity,transform] duration-150 group-hover:opacity-100 group-hover:translate-x-0"
        >
          {label}
        </span>
      )}
    </Link>
  );
}
