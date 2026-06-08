"use client";

import { FormEvent } from "react";
import { AUTH_CONFIG } from "@/lib/config";
import { Check, Key, Save } from "lucide-react";

interface ChangePasswordSectionProps {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  passwordError: string;
  passwordSuccess: boolean;
  passwordSaving: boolean;
  setCurrentPassword: (v: string) => void;
  setNewPassword: (v: string) => void;
  setConfirmPassword: (v: string) => void;
  handlePasswordChange: (e: FormEvent) => Promise<void>;
}

export function ChangePasswordSection({
  currentPassword,
  newPassword,
  confirmPassword,
  passwordError,
  passwordSuccess,
  passwordSaving,
  setCurrentPassword,
  setNewPassword,
  setConfirmPassword,
  handlePasswordChange,
}: ChangePasswordSectionProps) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Key className="h-4 w-4 text-text-accent" />
        <h2 className="text-sm font-medium text-text-primary">Change Password</h2>
      </div>

      <form onSubmit={handlePasswordChange} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
            minLength={AUTH_CONFIG.passwordMinLength}
            required
          />
          <p className="mt-1 text-xxs text-text-muted">
            At least 8 characters with a letter and a number
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
            minLength={AUTH_CONFIG.passwordMinLength}
            required
          />
        </div>

        {passwordError && (
          <div className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
            {passwordError}
          </div>
        )}

        {passwordSuccess && (
          <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Password changed successfully
          </div>
        )}

        <button
          type="submit"
          disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {passwordSaving ? "Changing..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
