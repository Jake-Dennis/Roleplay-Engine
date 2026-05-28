"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, memo } from "react";
import Link from "next/link";
import {
  MessageSquare,
  LayoutDashboard,
  BookOpen,
  Globe,
  Settings,
  LogOut,
  Sparkles,
  Heart,
  Volume2,
  GitBranch,
  Clock,
  ListTodo,
  ChevronDown,
  User,
  Users as UsersIcon,
  FolderOpen,
  Shield,
} from "lucide-react";
import { TIME } from "@/lib/config";
import { renderLoop } from "@/lib/render-loop";
import { FPSCounter } from "@/components/ui/fps-counter";
import { ConnectionIndicator } from "@/components/ui/connection-indicator";
import { useIdleTracker } from "@/hooks/use-idle-tracker";
import { useApp } from "@/contexts/app-context";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/groups", label: "Groups", icon: FolderOpen },
  { href: "/session", label: "Sessions", icon: MessageSquare },
  { href: "/universe", label: "Universes", icon: Globe },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
  { href: "/personas", label: "Personas", icon: User },
  { href: "/npcs", label: "NPCs", icon: UsersIcon },
  { href: "/relationships", label: "Relationships", icon: Heart },
  { href: "/narrative-threads", label: "Threads", icon: GitBranch },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/voice-combiner", label: "Voice Mixer", icon: Volume2 },
  { href: "/jobs", label: "Jobs", icon: ListTodo },
  { href: "/admin/jobs", label: "Admin", icon: Shield },
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

const GroupSelector = memo(function GroupSelector() {
  const { activeGroup, groups, setActiveGroup, loading } = useApp();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="border-b border-border-default px-3 py-3">
        <div className="flex h-8 animate-pulse items-center rounded-lg bg-bg-raised" />
      </div>
    );
  }

  return (
    <div className="relative border-b border-border-default px-3 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeGroup ? (
            <>
              <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
              <span className="truncate">{activeGroup.name}</span>
            </>
          ) : (
            <span className="truncate text-text-muted">Personal</span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 rounded-lg border border-border-default bg-bg-elevated py-1 shadow-lg">
          <button
            onClick={() => { setActiveGroup(null); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
              !activeGroup
                ? "bg-accent/10 text-text-accent"
                : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
            }`}
          >
            <User className="h-3 w-3 flex-shrink-0 text-text-muted" />
            <span>Personal</span>
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => { setActiveGroup(g); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                activeGroup?.id === g.id
                  ? "bg-accent/10 text-text-accent"
                  : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
              }`}
            >
              <UsersIcon className="h-3 w-3 flex-shrink-0 text-accent" />
              <span className="truncate">{g.name}</span>
            </button>
          ))}
          <div className="border-t border-border-default mt-1 pt-1">
            <Link
              href="/groups/new"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-xs text-text-muted hover:text-text-accent"
            >
              New group...
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});

const SessionSelector = memo(function SessionSelector() {
  const { activeSession, setActiveSession, sessions, loading } = useApp();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="border-b border-border-default px-3 py-3">
        <div className="flex h-8 animate-pulse items-center rounded-lg bg-bg-raised" />
      </div>
    );
  }

  return (
    <div className="relative border-b border-border-default px-3 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeSession ? (
            <>
              {activeSession.type === "group" ? (
                <UsersIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
              ) : (
                <User className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
              )}
              <span className="truncate">{activeSession.name}</span>
            </>
          ) : (
            <span className="truncate text-text-muted">Select session</span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 rounded-lg border border-border-default bg-bg-elevated py-1 shadow-lg">
          {sessions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted">No sessions yet</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => { setActiveSession(s); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  activeSession?.id === s.id
                    ? "bg-accent/10 text-text-accent"
                    : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                }`}
              >
                {s.type === "group" ? (
                  <UsersIcon className="h-3 w-3 flex-shrink-0 text-accent" />
                ) : (
                  <User className="h-3 w-3 flex-shrink-0 text-text-muted" />
                )}
                <span className="truncate">{s.name}</span>
              </button>
            ))
          )}
          <div className="border-t border-border-default mt-1 pt-1">
            <Link
              href="/session/new"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-xs text-text-muted hover:text-text-accent"
            >
              New session...
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});

const UniverseSelector = memo(function UniverseSelector() {
  const { activeUniverse, setActiveUniverse, universes, loading } = useApp();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="border-b border-border-default px-3 py-3">
        <div className="flex h-8 animate-pulse items-center rounded-lg bg-bg-raised" />
      </div>
    );
  }

  return (
    <div className="relative border-b border-border-default px-3 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeUniverse ? (
            <>
              <Globe className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
              <span className="truncate">{activeUniverse.name}</span>
            </>
          ) : (
            <span className="truncate text-text-muted">Select universe</span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 rounded-lg border border-border-default bg-bg-elevated py-1 shadow-lg">
          {universes.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted">No universes yet</div>
          ) : (
            universes.map((u) => (
              <button
                key={u.id}
                onClick={() => { setActiveUniverse(u); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  activeUniverse?.id === u.id
                    ? "bg-accent/10 text-text-accent"
                    : "text-text-secondary hover:bg-bg-raised hover:text-text-primary"
                }`}
              >
                <Globe className="h-3 w-3 flex-shrink-0 text-accent" />
                <span className="truncate">{u.name}</span>
              </button>
            ))
          )}
          <div className="border-t border-border-default mt-1 pt-1">
            <Link
              href="/universe"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-xs text-text-muted hover:text-text-accent"
            >
              New universe...
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});

export function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, activeSession, setActiveSession, sessions } = useApp();

  // Sync session from URL — use context data instead of independent fetch
  useEffect(() => {
    const match = pathname?.match(/^\/session\/([a-f0-9-]+)$/i);
    if (match) {
      const sessionId = match[1];
      if (!activeSession || activeSession.id !== sessionId) {
        const found = sessions.find((s) => s.id === sessionId);
        if (found) {
          setActiveSession(found);
        }
      }
    }
  }, [pathname, activeSession, sessions, setActiveSession]);

  useEffect(() => {
    renderLoop.start();
    return () => renderLoop.stop();
  }, []);

  const { idleTime, currentTier, isIdle } = useIdleTracker();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-2 text-text-muted">
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

        {/* Group Selector */}
        <GroupSelector />

        {/* Session Selector */}
        <SessionSelector />

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

      {/* Main content area */}
      <div className="ml-56 flex flex-1 flex-col">
        {/* Connection Status Bar */}
        <ConnectionIndicator />

        {/* Page content */}
        <main className="relative flex-1 overflow-hidden">
          <div className="mx-auto h-full max-w-5xl px-6 py-3">{children}</div>

          {/* Idle status indicator */}
          {isIdle && (
            <div className="fixed bottom-2 left-58 z-40 rounded-md bg-bg-raised/90 px-2.5 py-1 text-xxs text-text-muted backdrop-blur-sm">
              Idle {Math.floor(idleTime / TIME.ONE_MINUTE)}m · Tier {currentTier}
            </div>
          )}

          {/* FPS Counter overlay (toggle with Ctrl+Shift+F) */}
          <FPSCounter />
        </main>
      </div>
    </div>
  );
}
