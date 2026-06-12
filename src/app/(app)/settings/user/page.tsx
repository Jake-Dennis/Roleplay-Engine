"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Save, Check, Settings2, Lock, Volume2, Sparkles } from "lucide-react";
import Link from "next/link";

export default function UserSettingsPage() {
  // TTS preferences
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsVolume, setTtsVolume] = useState(0.8);
  const [ttsFormat, setTtsFormat] = useState("mp3");
  const [autoTtsNarrator, setAutoTtsNarrator] = useState(false);
  const [autoTtsOtherPersonas, setAutoTtsOtherPersonas] = useState(false);
  const [autoTtsYourPersona, setAutoTtsYourPersona] = useState(false);
  const [ttsSkipLong, setTtsSkipLong] = useState(true);
  const [ttsLongThreshold, setTtsLongThreshold] = useState(500);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Narrator voice
  const [voices, setVoices] = useState<{ id: string; name: string; gender: string; language: string }[]>([]);
  const [narratorVoice, setNarratorVoice] = useState("");
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSuccess, setVoiceSuccess] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          if (data.settings.ttsSpeed !== undefined) setTtsSpeed(data.settings.ttsSpeed);
          if (data.settings.ttsVolume !== undefined) setTtsVolume(data.settings.ttsVolume);
          if (data.settings.ttsFormat) setTtsFormat(data.settings.ttsFormat);
          if (data.settings.autoTtsNarrator !== undefined) setAutoTtsNarrator(data.settings.autoTtsNarrator);
          if (data.settings.autoTtsOtherPersonas !== undefined) setAutoTtsOtherPersonas(data.settings.autoTtsOtherPersonas);
          if (data.settings.autoTtsYourPersona !== undefined) setAutoTtsYourPersona(data.settings.autoTtsYourPersona);
          if (data.settings.ttsSkipLong !== undefined) setTtsSkipLong(data.settings.ttsSkipLong);
          if (data.settings.ttsLongThreshold !== undefined) setTtsLongThreshold(data.settings.ttsLongThreshold);
        }
        setSettingsLoading(false);
      })
      .catch(() => setSettingsLoading(false));

    fetch("/api/tts/voices").then(r => r.json()).then(d => setVoices(d.voiceDetails || [])).catch(() => {});
    fetch("/api/voice-assignments?entityType=narrator&entityId=default").then(r => r.json()).then(d => { if (d.assignment) setNarratorVoice(d.assignment.voiceName); }).catch(() => {});
  }, []);

  async function handleTTSSave() {
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ttsSpeed, ttsVolume, ttsFormat,
          autoTtsNarrator, autoTtsOtherPersonas, autoTtsYourPersona,
          ttsSkipLong, ttsLongThreshold,
        }),
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleNarratorVoice() {
    setVoiceSaving(true); setVoiceError("");
    try {
      const res = await fetch("/api/voice-assignments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: "narrator", entityId: "default", voiceName: narratorVoice }) });
      if (res.ok) { setVoiceSuccess(true); setTimeout(() => setVoiceSuccess(false), 3000); }
      else { const err = await res.json().catch(() => ({ error: "Failed" })); setVoiceError(err.error || "Failed"); }
    } catch { setVoiceError("Connection failed"); }
    finally { setVoiceSaving(false); }
  }

  async function handlePasswordChange() {
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setPasswordError(err.error || "Failed to update password");
      }
    } catch {
      setPasswordError("Connection failed");
    } finally {
      setPasswordSaving(false);
    }
  }

  if (settingsLoading) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-xs text-text-muted">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-text-primary">User Settings</h1>
          <p className="mt-1 text-xs text-text-muted">Personal playback preferences and account settings</p>
        </div>
      </div>

      {/* TTS Playback Preferences */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Settings2 className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">TTS Playback Preferences</h2>
        </div>
        <p className="text-xs text-text-muted mb-4">
          These settings override server-wide TTS defaults for your account.
        </p>

        <div className="space-y-4">
          {/* Speed */}
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Speed: {ttsSpeed.toFixed(1)}x
            </label>
            <input
              type="range" min="0.5" max="2.0" step="0.1"
              value={ttsSpeed}
              onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xxs text-text-muted">
              <span>0.5x</span><span>2.0x</span>
            </div>
          </div>

          {/* Volume */}
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Volume: {Math.round(ttsVolume * 100)}%
            </label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={ttsVolume}
              onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xxs text-text-muted">
              <span>0%</span><span>100%</span>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Format</label>
            <select
              value={ttsFormat}
              onChange={(e) => setTtsFormat(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="ogg">OGG</option>
              <option value="flac">FLAC</option>
            </select>
          </div>

          {/* Auto-Play TTS */}
          <div>
            <p className="text-xs font-medium text-text-primary mb-3">Auto-Play TTS</p>
            <p className="text-xxs text-text-muted mb-3">Automatically play audio for each message type</p>
            <div className="space-y-2">
              {/* Narrator */}
              <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
                <div>
                  <p className="text-xs text-text-primary">Narrator</p>
                  <p className="text-xxs text-text-muted">Auto-speak AI narration</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoTtsNarrator(!autoTtsNarrator)}
                  className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${autoTtsNarrator ? "bg-accent" : "bg-bg-highlight"}`}
                >
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoTtsNarrator ? "left-4" : "left-0.5"}`} />
                </button>
              </div>
              {/* Your Persona */}
              <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
                <div>
                  <p className="text-xs text-text-primary">Your Persona</p>
                  <p className="text-xxs text-text-muted">Auto-speak messages from your character</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoTtsYourPersona(!autoTtsYourPersona)}
                  className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${autoTtsYourPersona ? "bg-accent" : "bg-bg-highlight"}`}
                >
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoTtsYourPersona ? "left-4" : "left-0.5"}`} />
                </button>
              </div>
              {/* Other Personas */}
              <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
                <div>
                  <p className="text-xs text-text-primary">Other Personas</p>
                  <p className="text-xxs text-text-muted">Auto-speak other players&apos; characters</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoTtsOtherPersonas(!autoTtsOtherPersonas)}
                  className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${autoTtsOtherPersonas ? "bg-accent" : "bg-bg-highlight"}`}
                >
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoTtsOtherPersonas ? "left-4" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Skip long toggle */}
          <div className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2.5">
            <div>
              <p className="text-xs text-text-primary">Skip long messages</p>
              <p className="text-xxs text-text-muted">Don&apos;t speak messages over {ttsLongThreshold} characters</p>
            </div>
            <button
              type="button"
              onClick={() => setTtsSkipLong(!ttsSkipLong)}
              className={`relative h-5 w-9 rounded-full transition-colors ${ttsSkipLong ? "bg-accent" : "bg-bg-highlight"}`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${ttsSkipLong ? "left-4" : "left-0.5"}`} />
            </button>
          </div>

          {ttsSkipLong && (
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Skip threshold: {ttsLongThreshold} chars</label>
              <input
                type="range" min="200" max="1000" step="50"
                value={ttsLongThreshold}
                onChange={(e) => setTtsLongThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xxs text-text-muted"><span>200</span><span>1000</span></div>
            </div>
          )}

          <button
            onClick={handleTTSSave}
            disabled={settingsSaving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save Preferences
          </button>

          {settingsSaved && (
            <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              Preferences saved
            </div>
          )}
        </div>
      </div>

      {/* Narrator Voice */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Volume2 className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Narrator Voice</h2>
        </div>
        <p className="text-xs text-text-muted mb-3">
          Choose the voice used for AI narration in story sessions
        </p>
        <div className="flex items-center gap-2">
          <select
            value={narratorVoice}
            onChange={(e) => setNarratorVoice(e.target.value)}
            disabled={voiceSaving}
            className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
          >
            <option value="">No voice</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name || v.id} ({v.gender}, {v.language})
              </option>
            ))}
          </select>
          <button
            onClick={handleNarratorVoice}
            disabled={voiceSaving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {voiceSaving ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </button>
        </div>
        {voiceSuccess && (
          <div className="flex items-center gap-1.5 mt-3 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Narrator voice saved
          </div>
        )}
        {voiceError && (
          <div className="flex items-center gap-1.5 mt-3 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
            <span>{voiceError}</span>
          </div>
        )}
      </div>

      {/* Password Change */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Lock className="h-4 w-4 text-text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Change Password</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
            />
          </div>

          {passwordError && (
            <div className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{passwordError}</div>
          )}

          <button
            onClick={handlePasswordChange}
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" />
            Update Password
          </button>

          {passwordSuccess && (
            <div className="flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              Password updated
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
