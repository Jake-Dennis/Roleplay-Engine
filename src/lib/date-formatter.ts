/**
 * Date Formatter
 *
 * Centralized date formatting for consistent display across the app.
 * All DB timestamps are UTC (no timezone suffix). This module treats
 * them as UTC and converts to the user's local timezone for display.
 */

export interface DateFormatOptions {
  locale?: string;
  dateStyle?: "full" | "long" | "medium" | "short";
  timeStyle?: "full" | "long" | "medium" | "short";
  relative?: boolean;
}

const DEFAULT_OPTIONS: DateFormatOptions = {
  locale: "en-US",
  dateStyle: "medium",
};

/**
 * Parse a DB timestamp string as UTC. Treats any string without
 * timezone info as UTC (consistent with SQLite CURRENT_TIMESTAMP).
 */
function parseDbTimestamp(dateInput: string | Date | null | undefined): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;

  // If the string has no timezone marker (Z, +, - offset), treat it as UTC
  if (typeof dateInput === "string" && !/[Zz+-]/.test(dateInput)) {
    dateInput = dateInput.replace(" ", "T") + "Z";
  }

  const date = new Date(dateInput);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format a date string or timestamp for display
 */
export function formatDate(
  dateInput: string | Date | null | undefined,
  options: DateFormatOptions = {}
): string {
  const date = parseDbTimestamp(dateInput);
  if (!date) return "Unknown";

  const { locale = DEFAULT_OPTIONS.locale, dateStyle = DEFAULT_OPTIONS.dateStyle, timeStyle, relative } = options;

  // Relative time formatting
  if (relative) {
    return formatRelative(date);
  }

  // Standard formatting — Intl.DateTimeFormat uses the user's locale timezone
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle,
    timeStyle,
  });

  return formatter.format(date);
}

/**
 * Format as relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  if (Math.abs(diffSec) < 60) {
    return rtf.format(diffSec, "second");
  } else if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, "minute");
  } else if (Math.abs(diffHour) < 24) {
    return rtf.format(diffHour, "hour");
  } else if (Math.abs(diffDay) < 30) {
    return rtf.format(diffDay, "day");
  } else {
    return formatDate(date, { dateStyle: "medium" });
  }
}

/**
 * Format as time only (e.g., "3:45 PM")
 */
export function formatTime(dateInput: string | Date | null | undefined): string {
  return formatDate(dateInput, { timeStyle: "short" });
}

/**
 * Format as date and time (e.g., "Jan 15, 2024, 3:45 PM")
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  return formatDate(dateInput, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Format as compact relative time (e.g., "just now", "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = parseDbTimestamp(date instanceof Date ? date.toISOString() : date);
  if (!then) return "";
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}
