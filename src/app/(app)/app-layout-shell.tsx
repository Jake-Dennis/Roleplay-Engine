"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useMemo, memo } from "react";
import Link from "next/link";
// Initialize CSRF fetch patching (side-effect import runs once)
import "@/lib/csrf-client";

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
  ChevronRight,
  User,
  Users as UsersIcon,
  FolderOpen,
  Shuffle,
  MessageCircle,
  UserCheck,
  Ghost,
  MapPin,
  Package,
  Calendar,
  Flag,
  Search,
  Plus,
  Menu,
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
  { href: "/entities", label: "Entities", icon: UserCheck },
  { href: "/relationships", label: "Relationships", icon: Heart },
  { href: "/narrative-threads", label: "Threads", icon: GitBranch },
  { href: "/conversations", label: "Conversations", icon: MessageCircle },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/voice-combiner", label: "Voice Mixer", icon: Volume2 },
  { href: "/jobs", label: "Jobs", icon: ListTodo },
  { href: "/admin/restructure", label: "Restructure", icon: Shuffle },
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
      <div className="mb-1.5 text-xxs font-medium tracking-wider text-text-muted uppercase">Active Group</div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeGroup ? (
            <>
              <UsersIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
              <span className="truncate">{activeGroup.name}</span>
            </>
          ) : (
            <>
              <User className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
              <span className="truncate text-text-primary">Personal</span>
            </>
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
      <div className="mb-1.5 text-xxs font-medium tracking-wider text-text-muted uppercase">Active Session</div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeSession ? (
            <>
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
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
                <MessageSquare className="h-3 w-3 flex-shrink-0 text-accent" />
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
      <div className="mb-1.5 text-xxs font-medium tracking-wider text-text-muted uppercase">Active Universe</div>
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
  const { user, loading, activeSession, setActiveSession, sessions, activeUniverse } = useApp();

  // Wiki uses its own 3-column full-bleed layout (file tree | content | right panel).
  // Opt out of the shell's max-w-5xl centering for /wiki and /wiki/* routes.
  const isFullBleed = pathname?.startsWith("/wiki") ?? false;

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

  // Entity browser state
  const [wikiPages, setWikiPages] = useState<Array<{ path: string; frontmatter: Record<string, unknown> }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/wiki?universe_id=${activeUniverse?.id || ''}`)
      .then(r => r.json())
      .then(d => setWikiPages(d.pages || []))
      .catch(() => {});
  }, [activeUniverse]);

  const sidebarSections = useMemo(() => {
    const typeDefs = [
      { type: 'persona', label: 'Personas', icon: User, color: 'text-blue-400' },
      { type: 'npc', label: 'NPCs', icon: Ghost, color: 'text-purple-400' },
      { type: 'location', label: 'Locations', icon: MapPin, color: 'text-green-400' },
      { type: 'item', label: 'Items', icon: Package, color: 'text-orange-400' },
      { type: 'event', label: 'Events', icon: Calendar, color: 'text-amber-400' },
      { type: 'faction', label: 'Factions', icon: Flag, color: 'text-rose-400' },
    ];
    const query = searchQuery.toLowerCase();
    const filtered = query ? wikiPages.filter(p => (p.frontmatter?.title as string || '').toLowerCase().includes(query)) : wikiPages;
    return typeDefs.map(def => {
      const pages = filtered.filter(p => {
        const eid = (p.frontmatter?.entity_id as string) || '';
        const subtype = (p.frontmatter?.subtype as string) || '';
        const type = (p.frontmatter?.type as string) || '';
        if (def.type === 'persona') return (subtype === 'character' || (!subtype && type === 'entity')) && eid.startsWith('persona:');
        if (def.type === 'npc') return (subtype === 'character' || (!subtype && type === 'entity')) && (!eid || eid.startsWith('npc:'));
        return subtype === def.type;
      }).map(p => ({ path: p.path, title: (p.frontmatter?.title as string) || p.path.split('/').pop()?.replace('.md', '') || p.path }))
       .sort((a, b) => a.title.localeCompare(b.title));
      return { ...def, pages };
    });
  }, [wikiPages, searchQuery]);

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
    <div className="flex h-screen bg-bg-base">
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

        {/* Universe Selector */}
        <UniverseSelector />

        {/* Session Selector */}
        <SessionSelector />

        {/* Entity Browser */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {/* Search + New */}
          <div className="flex items-center gap-1 mb-2">
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 rounded border border-border-default bg-bg-raised text-xxs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={() => router.push('/wiki')}
              className="p-1.5 rounded hover:bg-bg-raised text-text-muted hover:text-text-primary"
              title="New page"
            >
              <Plus size={12} />
            </button>
          </div>

          {sidebarSections.filter(s => s.pages.length > 0).map(section => (
            <div key={section.type}>
              <button
                onClick={() => setCollapsedSections(prev =>
                  prev.includes(section.type) ? prev.filter(t => t !== section.type) : [...prev, section.type]
                )}
                className="flex items-center gap-1.5 w-full text-left px-1 py-1 rounded hover:bg-bg-raised text-xxs font-medium text-text-secondary"
              >
                <ChevronRight size={10} className={`transition-transform ${collapsedSections.includes(section.type) ? '' : 'rotate-90'}`} />
                <section.icon size={11} className={section.color} />
                {section.label}
                <span className="text-xxs text-text-muted ml-auto">{section.pages.length}</span>
              </button>
              {!collapsedSections.includes(section.type) && (
                <div className="ml-3 space-y-0.5">
                  {section.pages.slice(0, 20).map(p => (
                    <button
                      key={p.path}
                      onClick={() => {
                        const slug = p.path.replace(/\.md$/, '');
                        router.push(`/wiki/${slug}`);
                      }}
                      className="w-full text-left px-2 py-0.5 rounded text-xxs text-text-muted hover:text-text-primary hover:bg-bg-raised truncate"
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {wikiPages.length === 0 && (
            <p className="text-xxs text-text-muted text-center py-4">No wiki pages yet</p>
          )}
        </div>

        {/* Nav links + User area */}
        <div className="border-t border-border-default px-2 py-1.5">
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xxs text-text-muted hover:text-text-primary hover:bg-bg-raised"
          >
            <Menu size={11} />
            Navigation
            <ChevronDown size={10} className={`ml-auto transition-transform ${navOpen ? 'rotate-180' : ''}`} />
          </button>
          {navOpen && (
            <div className="mt-1 space-y-0.5 px-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xxs transition-colors ${
                      isActive ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-bg-raised'
                    }`}
                  >
                    <Icon size={11} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between px-2 py-1.5 mt-1 rounded text-xxs text-text-muted">
            <span className="truncate">{user?.username}</span>
            <button onClick={handleLogout} className="p-0.5 rounded hover:text-text-primary" title="Logout">
              <LogOut size={11} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="ml-56 flex flex-1 flex-col">
        {/* Connection Status Bar */}
        <ConnectionIndicator />

        {/* Page content */}
        <main className="relative flex-1 overflow-y-auto">
          {isFullBleed ? (
            <div className="min-h-full">{children}</div>
          ) : (
            <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 py-6">{children}</div>
          )}

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
