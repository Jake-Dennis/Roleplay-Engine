export function parseBoundaries(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  }
}
