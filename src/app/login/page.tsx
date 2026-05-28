"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Login failed");
        return;
      }

      // Browser sets httpOnly cookie from response automatically
      const meRes = await fetch("/api/auth/me");

      if (meRes.ok) {
        window.location.href = "/dashboard";
      } else {
        setError("Login succeeded but session could not be verified. Try again.");
      }
    } catch {
      setError("Connection failed. Is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-text-primary">
            Roleplay Engine
          </span>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-border-default bg-bg-elevated p-8">
          <h1 className="mb-1 text-base font-semibold text-text-primary">
            Welcome back
          </h1>
          <p className="mb-6 text-xs text-text-muted">
            Sign in to continue your stories
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-text-secondary">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent"
                placeholder="Enter your username"
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-text-secondary">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-text-muted">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-text-accent transition-colors hover:text-accent-hover"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
