/**
 * Test Setup — jsdom environment for React component tests.
 *
 * This file is preloaded by bun before any test files run.
 * It creates a full DOM environment using jsdom and registers
 * global APIs so that @testing-library/react works correctly.
 *
 * IMPORTANT: This file must NOT import @testing-library/react or
 * @testing-library/jest-dom, because those modules eagerly create
 * the `screen` singleton at import time. If `document` isn't yet
 * available at that point, `screen` gets created in error mode.
 * Instead, those imports go into test-utils.ts which imports this
 * file first.
 */

import { JSDOM, type DOMWindow } from "jsdom";

// Create a jsdom instance with full browser APIs
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost:3000",
  pretendToBeVisual: true,
});

const win = dom.window as DOMWindow & typeof globalThis;

// Copy all jsdom globals onto the Node.js global object
const GLOBALS_TO_SET: (keyof DOMWindow)[] = [
  "document",
  "window",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLAnchorElement",
  "HTMLSpanElement",
  "HTMLParagraphElement",
  "CustomEvent",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
  "FocusEvent",
  "InputEvent",
  "PointerEvent",
  "DragEvent",
  "Node",
  "NodeList",
  "Element",
  "DocumentFragment",
  "ShadowRoot",
  "MutationObserver",
  "ResizeObserver",
  "IntersectionObserver",
  "getComputedStyle",
  "matchMedia",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "focus",
  "scroll",
  "scrollTo",
  "scrollBy",
  "location",
  "navigator",
  "history",
  "localStorage",
  "sessionStorage",
];

for (const key of GLOBALS_TO_SET) {
  const value = (win as unknown as Record<string, unknown>)[key];
  if (value !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any)[key] = value;
  }
}

// jsdom doesn't define textEncoder/decoder but Node.js does — skip these
