/**
 * Shared Test Utilities
 *
 * Imports the jsdom setup FIRST (before @testing-library/react),
 * ensuring screen, render, fireEvent, etc. are properly initialized
 * with a DOM environment.
 *
 * IMPORTANT: The import order matters — setup.ts must be imported
 * BEFORE @testing-library/react, so that `document` (and other DOM
 * globals) are available when @testing-library/dom creates the
 * `screen` singleton at module load time.
 *
 * All component tests should import from here instead of
 * directly from @testing-library/react.
 */

import "../../setup";
import "@testing-library/jest-dom";
import type { ReactElement } from "react";
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
  cleanup,
} from "@testing-library/react";

// Re-export everything
export {
  screen,
  fireEvent,
  waitFor,
  within,
  act,
  cleanup,
};

/**
 * Custom render that wraps RTL render with any needed providers.
 * For now, just re-exports the standard render.
 */
export function render(ui: ReactElement) {
  return rtlRender(ui);
}

/**
 * Clean up DOM between tests. Call this in each test file's afterEach:
 *
 *   import { afterEach } from "bun:test";
 *   import { cleanupAfterEach } from "./test-utils";
 *   afterEach(() => cleanupAfterEach());
 */
export function cleanupAfterEach(): void {
  cleanup();
  document.body.innerHTML = "";
}

/** Re-export vi from bun:test for convenience */
export { vi } from "bun:test";
