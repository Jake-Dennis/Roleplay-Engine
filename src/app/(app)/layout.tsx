"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useMemo, memo } from "react";
import Link from "next/link";
import {
  MessageSquare,
  LayoutDashboard,
  BookOpen,
  Globe,
  Users,
  Settings,
  LogOut,
  Sparkles,
  Heart,
  Calendar,
  Shield,
  Volume2,
  Network,
  CheckCircle,
  GitBranch,
  Clock,
  ListTodo,
  ChevronDown,
} from "lucide-react";
import { renderLoop } from "@/lib/render-loop";
import { FPSCounter } from "@/components/ui/fps-counter";
import { ConnectionIndicator } from "@/components/ui/connection-indicator";
import { useIdleTracker } from "@/hooks/use-idle-tracker";
import { ActiveUniverseProvider, useActiveUniverse } from "@/contexts/active-universe";

export const dynamic = "force-dynamic";

interface User {
  id: string;
  username: string;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/session", label: "Sessions", icon: MessageSquare },
  { href: "/universe", label: "Universes", icon: Globe },
  { href: "/lore", label: "Lore", icon: BookOpen },
  { href: "/characters", label: "Characters", icon: Users },
  { href: "/relationships", label: "Relationships", icon: Heart },
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/narrative-threads", label: "Threads", icon: GitBranch },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/canon", label: "Canon", icon: Shield },
  { href: "/voice-combiner", label: "Voice Mixer", icon: Volume2 },
  { href: "/graph", label: "Backlinks", icon: Network },
  { href: "/validations", label: "Validations", icon: CheckCircle },
  { href: "/jobs", label: "Jobs", icon: ListTodo },
  { href: "/settings", label: "Settings", icon: Settings },
];

const NavItem = memo(function NavItem({
  item,
  isActive,
}: {
  item: (typeof navItems)[number];
  isActive: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors ${
        isActive
          ? "bg-accent/10 text-text-accent"
          : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
});

const UniverseSelector = memo(function UniverseSelector() {
  const { activeUniverse, universes, setActiveUniverse, loading } = useActiveUniverse();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="border-b border-border-default px-3 py-3">
        <div className="flex h-8 animate-pulse items-center rounded-lg bg-bg-raised" />
      </div>
    );
  }

  if (universes.length === 0) {
    return (
      <div className="border-b border-border-default px-3 py-3">
        <Link
          href="/universe"
          className="flex items-center justify-between rounded-lg border border-dashed border-border-default px-3 py-2 text-xs text-text-muted transition-colors hover:border-accent hover:text-text-accent"
        >
          <span className="truncate">No universe</span>
          <Globe className="h-3.5 w-3.5 flex-shrink-0" />
        </Link>
      </div>
    );
  }

  return (
    <div className="relative border-b border-border-default px-3 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
      >
        <span className="truncate">{activeUniverse?.name || "Select universe"}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 rounded-lg border border-border-default bg-bg-elevated py-1 shadow-lg">
          {universes.map((u) => (
            <button
              key={u.id}
              onClick={() => { setActiveUniverse(u); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                activeUniverse?.id === u.id
                  ? "bg-accent/10 text-text-accent"
                  : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
              }`}
            >
              {u.name}
            </button>
          ))}
          <div className="border-t border-border-default mt-1 pt-1">
            <Link
              href="/universe"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-xs text-text-muted hover:text-text-accent"
            >
              Manage universes...
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveUniverseProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </ActiveUniverseProvider>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  // Start the 30fps render loop on app mount
  useEffect(() => {
    renderLoop.start();
    return () => renderLoop.stop();
  }, []);

  // Track user idle time and trigger server-side enrichment
  const { idleTime, currentTier, isIdle } = useIdleTracker();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="flex items-center gap-2 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg-base">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-30 flex h-full w-56 flex-col border-r border-border-default bg-bg-elevated">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-border-default px-4 py-3.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent">
            <MessageSquare className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            Roleplay Engine
          </span>
        </div>

        {/* Universe Selector */}
        <UniverseSelector />

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return <NavItem key={item.href} item={item} isActive={isActive} />;
          })}
        </nav>

        {/* User area */}
        <div className="border-t border-border-default px-2 py-2.5">
          <div className="flex items-center justify-between rounded-md px-3 py-2 text-xs text-text-secondary">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-raised text-xxs text-text-muted">
                {user?.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-text-primary">{user?.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-56 flex-1 pb-8">
        <div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
      </main>

      {/* Idle status indicator */}
      {isIdle && (
        <div className="fixed bottom-2 left-58 z-40 rounded-md bg-bg-raised/90 px-2.5 py-1 text-xxs text-text-muted backdrop-blur-sm">
          Idle {Math.floor(idleTime / 60000)}m · Tier {currentTier}
        </div>
      )}

      {/* FPS Counter overlay (toggle with Ctrl+Shift+F) */}
      <FPSCounter />

      {/* Connection Status Footer */}
      <ConnectionIndicator />
    </div>
  );
}
