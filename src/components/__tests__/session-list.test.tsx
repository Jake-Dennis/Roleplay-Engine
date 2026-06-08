/**
 * Tests for src/components/session/session-list.tsx
 *
 * Covers:
 *   - Rendering a list of sessions
 *   - Loading state
 *   - Empty state when no sessions
 *   - Click handler on session
 *   - Delete button behavior
 *   - Solo vs group type badges
 *   - Date formatting
 */

import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, fireEvent, vi, cleanupAfterEach } from "./test-utils";

afterEach(() => cleanupAfterEach());
import { SessionList } from "../session/session-list";

const mockSessions = [
  {
    id: "session-1",
    name: "The Lost Mines",
    type: "solo",
    status: "active",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-06-01T14:30:00Z",
    owner_name: "Alice",
  },
  {
    id: "session-2",
    name: "Council of Elrond",
    type: "group",
    status: "active",
    created_at: "2026-02-20T08:00:00Z",
    updated_at: null,
    owner_name: "Bob",
  },
];

describe("SessionList", () => {
  it("renders a list of sessions", () => {
    render(
      <SessionList
        sessions={mockSessions}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    expect(screen.getByText("The Lost Mines")).toBeInTheDocument();
    expect(screen.getByText("Council of Elrond")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(
      <SessionList
        sessions={[]}
        loading={true}
        onSessionClick={() => {}}
      />
    );
    expect(screen.getByText("Loading sessions...")).toBeInTheDocument();
    expect(screen.queryByText("The Lost Mines")).not.toBeInTheDocument();
  });

  it("shows empty state when no sessions and not loading", () => {
    render(
      <SessionList
        sessions={[]}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    expect(screen.getByText("No sessions")).toBeInTheDocument();
    expect(
      screen.getByText("Create a session to start roleplaying")
    ).toBeInTheDocument();
  });

  it("calls onSessionClick when a session is clicked", () => {
    const onSessionClick = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        loading={false}
        onSessionClick={onSessionClick}
      />
    );
    fireEvent.click(screen.getByText("The Lost Mines"));
    expect(onSessionClick).toHaveBeenCalledWith("session-1");
  });

  it("calls onSessionClick with the correct id", () => {
    const onSessionClick = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        loading={false}
        onSessionClick={onSessionClick}
      />
    );
    fireEvent.click(screen.getByText("Council of Elrond"));
    expect(onSessionClick).toHaveBeenCalledWith("session-2");
  });

  it("shows solo badge for solo sessions", () => {
    render(
      <SessionList
        sessions={mockSessions}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    const soloBadges = screen.getAllByText("Solo");
    expect(soloBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows group badge for group sessions", () => {
    render(
      <SessionList
        sessions={mockSessions}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    expect(screen.getByText("Group")).toBeInTheDocument();
  });

  it("displays the owner name", () => {
    render(
      <SessionList
        sessions={[mockSessions[0]]}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows delete button when onDelete is provided", () => {
    const onDelete = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        loading={false}
        onSessionClick={() => {}}
        onDelete={onDelete}
      />
    );
    const deleteButtons = screen.getAllByTitle("Delete session");
    expect(deleteButtons).toHaveLength(2);
  });

  it("does not show delete buttons when onDelete is not provided", () => {
    render(
      <SessionList
        sessions={mockSessions}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    expect(screen.queryByTitle("Delete session")).not.toBeInTheDocument();
  });

  it("calls onDelete with the session id when delete is clicked", () => {
    const onDelete = vi.fn();
    render(
      <SessionList
        sessions={[mockSessions[0]]}
        loading={false}
        onSessionClick={() => {}}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByTitle("Delete session"));
    expect(onDelete).toHaveBeenCalledWith("session-1");
  });

  it("does not trigger onSessionClick when delete button is clicked", () => {
    const onSessionClick = vi.fn();
    const onDelete = vi.fn();
    render(
      <SessionList
        sessions={[mockSessions[0]]}
        loading={false}
        onSessionClick={onSessionClick}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByTitle("Delete session"));
    expect(onDelete).toHaveBeenCalled();
    expect(onSessionClick).not.toHaveBeenCalled();
  });

  it("renders updated_at date when available", () => {
    render(
      <SessionList
        sessions={[mockSessions[0]]}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    // Session 1 has updated_at set, so the locale date should be rendered
    const expectedDate = new Date("2026-06-01T14:30:00Z").toLocaleDateString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it("renders created_at date when updated_at is null", () => {
    render(
      <SessionList
        sessions={[mockSessions[1]]}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    const expectedDate = new Date("2026-02-20T08:00:00Z").toLocaleDateString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it("shows the session status", () => {
    render(
      <SessionList
        sessions={[mockSessions[0]]}
        loading={false}
        onSessionClick={() => {}}
      />
    );
    expect(screen.getByText("active")).toBeInTheDocument();
  });
});
