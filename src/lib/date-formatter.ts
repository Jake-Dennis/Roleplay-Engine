/**
 * Date Formatter
 *
 * Centralized date formatting for consistent display across the app.
 * Replaces inline `new Date(xxx).toLocaleDateString()` calls in 18+ pages.
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
 * Format a date string or timestamp for display
 */
export function formatDate(
  dateInput: string | Date | null | undefined,
  options: DateFormatOptions = {}
): string {
  if (!dateInput) return "Unknown";

  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Invalid date";

  const { locale = DEFAULT_OPTIONS.locale, dateStyle = DEFAULT_OPTIONS.dateStyle, timeStyle, relative } = options;

  // Relative time formatting
  if (relative) {
    return formatRelative(date);
  }

  // Standard formatting
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
