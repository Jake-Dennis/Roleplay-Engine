import { readWikiPage, writeWikiPage } from "./file-io";
import type { WikiFrontmatter } from "./file-io";

// ---------------------------------------------------------------------------
// Validation Workflow
//
// States: draft → reviewed → locked (immutable)
//         draft → rejected (can be re-requested as draft later)
// ---------------------------------------------------------------------------

/**
 * Approve a wiki page by moving it from "draft" to "reviewed".
 *
 * Returns `false` if the file doesn't exist or if the page is not in "draft"
 * state (e.g., already locked, already reviewed, or rejected).
 */
export async function validatePage(pagePath: string): Promise<boolean> {
  let page;
  try {
    page = readWikiPage(pagePath);
  } catch {
    return false;
  }

  const fm = page.frontmatter as WikiFrontmatter;

  // Only draft pages can be validated
  if (fm.status !== "draft") {
    return false;
  }

  fm.status = "reviewed";

  try {
    writeWikiPage(pagePath, page.content, fm);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reject a wiki page that is in "draft" state.
 *
 * Sets status to "rejected" and records the rejection reason and timestamp
 * in the frontmatter.
 *
 * Returns `false` if the file doesn't exist or if the page is not in "draft"
 * state.
 */
export async function rejectPage(
  pagePath: string,
  reason: string,
): Promise<boolean> {
  let page;
  try {
    page = readWikiPage(pagePath);
  } catch {
    return false;
  }

  const fm = page.frontmatter as WikiFrontmatter;

  // Only draft pages can be rejected
  if (fm.status !== "draft") {
    return false;
  }

  fm.status = "rejected";
  (fm as Record<string, any>).rejection_reason = reason;
  (fm as Record<string, any>).rejected_at = new Date().toISOString();

  try {
    writeWikiPage(pagePath, page.content, fm);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lock a wiki page, making it immutable to LLM modifications.
 *
 * Works on any non-locked page. Once locked, validatePage and rejectPage
 * will return false.
 *
 * Returns `false` if the file doesn't exist or if the page is already locked.
 */
export async function lockPage(pagePath: string): Promise<boolean> {
  let page;
  try {
    page = readWikiPage(pagePath);
  } catch {
    return false;
  }

  const fm = page.frontmatter as WikiFrontmatter;

  // Already locked — no-op
  if (fm.status === "locked") {
    return false;
  }

  fm.status = "locked";

  try {
    writeWikiPage(pagePath, page.content, fm);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a wiki page is locked (immutable).
 *
 * Returns `false` if the file doesn't exist.
 */
export async function isLocked(pagePath: string): Promise<boolean> {
  try {
    const page = readWikiPage(pagePath);
    const fm = page.frontmatter as WikiFrontmatter;
    return fm.status === "locked";
  } catch {
    return false;
  }
}
