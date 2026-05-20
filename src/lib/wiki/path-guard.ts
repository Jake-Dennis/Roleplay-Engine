import path from "path";

/**
 * Safely check whether a resolved file path is within a given root directory.
 *
 * Prevents path traversal attacks including Windows prefix bypass
 * (e.g., `C:\wiki-evil` passing a `C:\wiki` prefix check).
 *
 * Strategy:
 * 1. Normalize both paths with path.resolve() to eliminate `..` sequences
 * 2. Append trailing separator to root so `C:\wiki` does not match `C:\wiki-evil`
 * 3. Compare the normalized candidate against the normalized root
 *
 * @param candidatePath - The file path to validate (may be untrusted input)
 * @param rootDir - The root directory that should contain the candidate
 * @returns true if candidatePath is within rootDir, false otherwise
 */
export function isPathWithinRoot(candidatePath: string, rootDir: string): boolean {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedCandidate = path.resolve(candidatePath);
  return normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(normalizedRoot + path.sep);
}
