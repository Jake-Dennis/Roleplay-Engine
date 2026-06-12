"use client";

import { Server, User, Gauge } from "lucide-react";
import Link from "next/link";

const categories = [
  {
    href: "/settings/server",
    icon: Server,
    title: "Server Settings",
    description: "Ollama host, model, TTS server, and connection defaults",
  },
  {
    href: "/settings/user",
    icon: User,
    title: "User Settings",
    description: "TTS playback preferences, password, and personal defaults",
  },
  {
    href: "/settings/benchmark",
    icon: Gauge,
    title: "LLM Benchmark",
    description: "Find the best num_ctx and num_predict for roleplay at your desired response time",
  },
];

export default function SettingsHub() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-base font-semibold text-text-primary">Settings</h1>
        <p className="mt-1 text-xs text-text-muted">Manage all aspects of the application</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {categories.map((cat) => (
          <Link
            key={cat.href}
            href={cat.href}
            className="group rounded-xl border border-border-default bg-bg-elevated p-5 transition-colors hover:border-accent/50 hover:bg-bg-elevated/80"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <cat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-text-primary group-hover:text-accent">
                  {cat.title}
                </h2>
                <p className="mt-1 text-xs text-text-muted leading-relaxed">
                  {cat.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
