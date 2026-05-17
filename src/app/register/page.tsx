"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      // Auto-login after registration
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (loginRes.ok) {
        router.push("/dashboard");
      } else {
        router.push("/login");
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

        {/* Register Card */}
        <div className="rounded-xl border border-border-default bg-bg-elevated p-8">
          <h1 className="mb-1 text-base font-semibold text-text-primary">
            Create account
          </h1>
          <p className="mb-6 text-xs text-text-muted">
            Start your roleplaying journey
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
                placeholder="Choose a username"
                minLength={3}
                maxLength={20}
                required
                autoFocus
              />
              <p className="mt-1 text-xxs text-text-muted">
                3-20 characters, letters, numbers, and underscores
              </p>
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
                placeholder="Create a password"
                minLength={8}
                required
              />
              <p className="mt-1 text-xxs text-text-muted">
                At least 8 characters with a letter and a number
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-text-secondary">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent"
                placeholder="Confirm your password"
                minLength={8}
                required
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
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-text-muted">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-text-accent transition-colors hover:text-accent-hover"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
