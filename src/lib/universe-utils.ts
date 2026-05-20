import { safeParse } from "@/lib/safe-json";

export function parseBoundaries(raw: string | null): string[] {
  if (!raw) return [];
  const parsed = safeParse<string[]>(raw);
  return Array.isArray(parsed) ? parsed : raw.split("\n").map((s) => s.trim()).filter(Boolean);
}
