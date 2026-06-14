'use client';
import { useState, useCallback } from 'react';
import { Sparkles, Globe, MessagesSquare } from 'lucide-react';

interface WikiAiHeaderButtonsProps {
  pagePath: string;
  universeId?: string;
}

type ButtonKey = 'enrich' | 'deepen' | 'rumors';

const BUTTONS: Record<ButtonKey, { label: string; icon: typeof Sparkles; endpoint: string; description: string }> = {
  enrich: { label: 'Enrich', icon: Sparkles, endpoint: '/api/wiki/enrich', description: 'Add more details, traits, and descriptions to this page via AI' },
  deepen: { label: 'Deepen', icon: Globe, endpoint: '/api/wiki/deepen', description: 'Find cross-references and connections to other wiki pages' },
  rumors: { label: 'Rumors', icon: MessagesSquare, endpoint: '/api/wiki/generate-rumors', description: 'Generate in-world rumors and hearsay based on this page' },
};

/**
 * Header buttons for the wiki page that trigger AI background jobs:
 * Enrich (wiki_enrich_entity), Deepen (wiki_deepen_page), Generate Rumors (wiki_generate_rumors).
 *
 * Shows a brief "Job queued" notification on success.
 */
export default function WikiAiHeaderButtons({
  pagePath,
  universeId,
}: WikiAiHeaderButtonsProps) {
  const [loading, setLoading] = useState<ButtonKey | null>(null);
  const [notifications, setNotifications] = useState<Array<{ key: ButtonKey; message: string }>>([]);

  const addNotification = useCallback((key: ButtonKey, message: string) => {
    setNotifications((prev) => [...prev, { key, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.key !== key));
    }, 3000);
  }, []);

  const handleClick = useCallback(
    async (key: ButtonKey) => {
      setLoading(key);
      try {
        const config = BUTTONS[key];
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pagePath,
            universeId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }));
          addNotification(key, err.error || 'Request failed');
          return;
        }

        addNotification(key, `${config.label} job queued`);
      } catch {
        addNotification(key, 'Network error');
      } finally {
        setLoading(null);
      }
    },
    [pagePath, universeId, addNotification]
  );

  return (
    <>
      {/* Notification toasts */}
      {notifications.map((n) => (
        <div
          key={n.key}
          className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg bg-bg-elevated border border-border-default shadow-lg text-xs text-text-primary animate-in slide-in-from-right-2"
        >
          {n.message}
        </div>
      ))}

      {/* Buttons */}
      {(Object.entries(BUTTONS) as [ButtonKey, typeof BUTTONS[ButtonKey]][]).map(([key, config]) => {
        const Icon = config.icon;
        const isActive = loading === key;
        return (
          <button
            key={key}
            onClick={() => handleClick(key)}
            disabled={loading !== null}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
              isActive
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-bg-base text-text-secondary border border-border-default hover:text-text-primary hover:border-accent/30'
            }`}
            title={config.description}
          >
            <Icon size={12} className={isActive ? 'animate-pulse' : ''} />
            {config.label}
          </button>
        );
      })}
    </>
  );
}
