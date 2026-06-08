/**
 * Tests for src/components/ui/modal.tsx
 *
 * Covers:
 *   - Rendering children when open
 *   - Hiding content when closed
 *   - Escape key closes the modal
 *   - Backdrop click closes the modal
 *   - Title rendering
 */

import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, fireEvent, vi, cleanupAfterEach } from "./test-utils";

afterEach(() => cleanupAfterEach());
import { Modal } from "../ui/modal";

describe("Modal", () => {
  it("renders children when open=true", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does NOT render children when open=false", () => {
    render(
      <Modal open={false} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    // The backdrop is the first div inside the Modal wrapper (before the panel)
    // We target the outer overlay div which has the onClick handler
    const backdrop = document.querySelector(".fixed.inset-0.z-50")?.firstElementChild;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the title when provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Title">
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("does not render title heading when title is omitted", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    // The h2 with id="modal-title" should not exist
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("renders the close button with aria-label", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByLabelText("Close modal")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>
    );
    fireEvent.click(screen.getByLabelText("Close modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders with aria-modal and role=dialog", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("applies size class when specified", () => {
    render(
      <Modal open={true} onClose={() => {}} size="lg">
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-lg");
  });

  it("defaults to md size when not specified", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-md");
  });

  it("sets aria-labelledby when title is provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Title">
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
  });

  it("removes event listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    unmount();
    // After unmount, pressing Escape should not call onClose
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
