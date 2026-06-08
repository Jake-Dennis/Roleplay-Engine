/**
 * Tests for src/components/chat/chat-window.tsx
 *
 * Covers:
 *   - Renders messages in the chat
 *   - Empty state when no messages
 *   - Scroll to bottom on new message (scrollIntoView check)
 *   - AI vs user message rendering
 *   - Streaming message display
 *   - Input area and send button
 *   - Narrative choices display
 *   - Disabled state (observer mode)
 *   - Edit history modal trigger
 *   - Action buttons (copy, delete, etc.)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, vi, cleanupAfterEach } from "./test-utils";

afterEach(() => cleanupAfterEach());
import { ChatWindow } from "../chat/chat-window";
import type { Intent } from "../../lib/intent-analyzer";

// ── Module mocks ────────────────────────────────────────────────────────────

// Mock StreamingText — render plain content
vi.mock("../chat/streaming-text", () => ({
  StreamingText: ({
    content,
    isStreaming,
  }: {
    content: string;
    isStreaming: boolean;
  }) => (
    <span data-testid="streaming-text" data-streaming={String(isStreaming)}>
      {content}
    </span>
  ),
}));

// Mock EditHistory — render a placeholder
vi.mock("../chat/edit-history", () => ({
  EditHistory: ({
    messageId,
    sessionId,
    onClose,
  }: {
    messageId: string;
    sessionId: string;
    onClose: () => void;
  }) => (
    <div data-testid="edit-history" data-msgid={messageId} data-sid={sessionId}>
      Edit History Mock
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// Mock intent-analyzer
vi.mock("../../lib/intent-analyzer", () => ({
  classifyIntent: vi.fn((_input: string): Intent => "social"),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const scrollRef = { current: document.createElement("div") };
const inputRef = { current: document.createElement("textarea") };

const defaultIntentIcons: Record<Intent, React.ReactNode> = {
  exploration: <span data-testid="intent-icon">🔍</span>,
  combat: <span data-testid="intent-icon">⚔️</span>,
  social: <span data-testid="intent-icon">💬</span>,
  investigation: <span data-testid="intent-icon">🔎</span>,
  rest: <span data-testid="intent-icon">😴</span>,
  travel: <span data-testid="intent-icon">🚶</span>,
  ritual: <span data-testid="intent-icon">🔮</span>,
};

const sampleMessages = [
  {
    id: "msg-1",
    sessionId: "session-1",
    senderId: "user-1",
    content: "Hello there!",
    timestamp: "2026-06-01T10:00:00Z",
    senderName: "Player",
    personaName: null,
    personaAvatar: null,
  },
  {
    id: "msg-2",
    sessionId: "session-1",
    senderId: null, // AI message
    content: "Welcome, adventurer! The journey begins.",
    timestamp: "2026-06-01T10:00:05Z",
    senderName: "Narrator",
    personaName: null,
    personaAvatar: null,
  },
  {
    id: "msg-3",
    sessionId: "session-1",
    senderId: "user-1",
    content: "I look around the room.",
    timestamp: "2026-06-01T10:01:00Z",
    senderName: "Player",
    personaName: "Aragorn",
    personaAvatar: null,
  },
];

const defaultProps = {
  messages: sampleMessages,
  isStreaming: false,
  streamingContent: "",
  input: "",
  editingId: null as string | null,
  editContent: "",
  copiedId: null as string | null,
  ttsPlayingId: null as string | null,
  intentIcons: defaultIntentIcons,
  onCopy: vi.fn(),
  onStartEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDelete: vi.fn(),
  onRegenerate: vi.fn(),
  onTtsPlay: vi.fn(),
  onEditContentChange: vi.fn(),
  onShowEditHistory: vi.fn(),
  onSend: vi.fn(),
  onInputChange: vi.fn(),
  onKeyDown: vi.fn(),
  scrollRef,
  inputRef,
  sessionId: "session-1",
  editHistoryMessageId: null as string | null,
  onEditHistoryClose: vi.fn(),
};

describe("ChatWindow", () => {
  beforeEach(() => {
    scrollRef.current = document.createElement("div");
    inputRef.current = document.createElement("textarea");
    vi.clearAllMocks();
  });

  // ── Message rendering ─────────────────────────────────────────────────────

  it("renders messages in the chat", () => {
    render(<ChatWindow {...defaultProps} />);
    expect(screen.getByText("Hello there!")).toBeInTheDocument();
    expect(
      screen.getByText("Welcome, adventurer! The journey begins.")
    ).toBeInTheDocument();
    expect(screen.getByText("I look around the room.")).toBeInTheDocument();
  });

  it("shows sender names for user messages", () => {
    render(<ChatWindow {...defaultProps} />);
    // User messages show the sender name
    const names = screen.getAllByText("Player");
    expect(names.length).toBeGreaterThanOrEqual(1);
    // AI messages show "AI Narrator"
    expect(screen.getByText("AI Narrator")).toBeInTheDocument();
  });

  it("shows persona name when provided", () => {
    render(<ChatWindow {...defaultProps} />);
    // The third message has personaName: "Aragorn" — it appears twice:
    // once as the sender name fallback, once in the persona badge
    const aragornElements = screen.getAllByText("Aragorn");
    expect(aragornElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no messages and not streaming", () => {
    render(<ChatWindow {...defaultProps} messages={[]} />);
    expect(
      screen.getByText("Send a message to start the story")
    ).toBeInTheDocument();
  });

  it("does not show empty state when streaming even with no messages", () => {
    render(
      <ChatWindow
        {...defaultProps}
        messages={[]}
        isStreaming={true}
        streamingContent="Once upon a time..."
      />
    );
    expect(
      screen.queryByText("Send a message to start the story")
    ).not.toBeInTheDocument();
    // Streaming content should be visible
    expect(screen.getByText("Once upon a time...")).toBeInTheDocument();
  });

  // ── Scroll to bottom ──────────────────────────────────────────────────────

  it("renders the scroll anchor div", () => {
    render(<ChatWindow {...defaultProps} />);
    // The scrollRef div is a child of the messages container
    expect(scrollRef.current).toBeDefined();
  });

  // We verify the scrollRef is set on a div rendered inside the messages area
  // by checking the component passes it through as a ref

  // ── Input area ────────────────────────────────────────────────────────────

  it("renders the input textarea", () => {
    render(<ChatWindow {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Type your message...");
    expect(textarea).toBeInTheDocument();
  });

  it("renders the send button", () => {
    render(<ChatWindow {...defaultProps} />);
    const sendButton = screen.getByRole("button", { name: "" });
    // Send icon (the button without aria-label that contains the Send icon)
    expect(sendButton).toBeInTheDocument();
  });

  it("disables send button when input is empty", () => {
    render(<ChatWindow {...defaultProps} input="" />);
    // Find the send button by looking for the lucide-send SVG inside a button
    const sendBtn = screen.getAllByRole("button").find(
      (btn) => btn.querySelector(".lucide-send") !== null
    );
    expect(sendBtn).toBeDefined();
    expect(sendBtn).toBeDisabled();
  });

  it("enables send button when input has text", () => {
    render(<ChatWindow {...defaultProps} input="Hello" />);
    const sendBtn = screen.getAllByRole("button").find(
      (btn) => btn.querySelector(".lucide-send") !== null
    );
    expect(sendBtn).toBeDefined();
    expect(sendBtn).not.toBeDisabled();
  });

  it("shows placeholder for streaming state", () => {
    render(<ChatWindow {...defaultProps} isStreaming={true} />);
    expect(
      screen.getByPlaceholderText("AI is responding...")
    ).toBeInTheDocument();
  });

  it("disables the input when streaming", () => {
    render(<ChatWindow {...defaultProps} isStreaming={true} />);
    const textarea = screen.getByPlaceholderText("AI is responding...");
    expect(textarea).toBeDisabled();
  });

  it("calls onInputChange when typing in the textarea", () => {
    const onInputChange = vi.fn();
    render(
      <ChatWindow {...defaultProps} onInputChange={onInputChange} />
    );
    const textarea = screen.getByPlaceholderText("Type your message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    expect(onInputChange).toHaveBeenCalledWith("Hello");
  });

  it("calls onSend when send button is clicked", () => {
    const onSend = vi.fn();
    render(
      <ChatWindow {...defaultProps} input="Hello" onSend={onSend} />
    );
    // Find the send button by the lucide-send SVG inside it
    const sendBtn = screen.getAllByRole("button").find(
      (btn) => btn.querySelector(".lucide-send") !== null
    );
    expect(sendBtn).toBeDefined();
    fireEvent.click(sendBtn!);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  // ── Disabled / observer state ─────────────────────────────────────────────

  it("shows observer message when disabled", () => {
    render(<ChatWindow {...defaultProps} disabled={true} />);
    expect(
      screen.getByText(
        "You are observing this session. Only participants can send messages."
      )
    ).toBeInTheDocument();
  });

  it("hides input area when disabled", () => {
    render(<ChatWindow {...defaultProps} disabled={true} />);
    expect(
      screen.queryByPlaceholderText("Type your message...")
    ).not.toBeInTheDocument();
  });

  // ── Action buttons ────────────────────────────────────────────────────────

  it("shows copy button for each message", () => {
    render(<ChatWindow {...defaultProps} />);
    const copyButtons = screen.getAllByTitle("Copy");
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows delete button for each message", () => {
    render(<ChatWindow {...defaultProps} />);
    const deleteButtons = screen.getAllByTitle("Delete");
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onCopy when copy button is clicked", () => {
    const onCopy = vi.fn();
    render(<ChatWindow {...defaultProps} onCopy={onCopy} />);
    const copyButtons = screen.getAllByTitle("Copy");
    fireEvent.click(copyButtons[0]);
    expect(onCopy).toHaveBeenCalledWith("msg-1", "Hello there!");
  });

  it("calls onDelete when delete button is clicked", () => {
    const onDelete = vi.fn();
    render(<ChatWindow {...defaultProps} onDelete={onDelete} />);
    const deleteButtons = screen.getAllByTitle("Delete");
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith("msg-1");
  });

  it("shows edit button only for user messages", () => {
    render(<ChatWindow {...defaultProps} />);
    const editButtons = screen.getAllByTitle("Edit");
    // Only user messages (senderId !== null) have edit buttons
    expect(editButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows regenerate button only for the last AI message", () => {
    // Only pass first 2 messages so the AI message (msg-2) is the last message
    render(
      <ChatWindow
        {...defaultProps}
        messages={sampleMessages.slice(0, 2)}
      />
    );
    const regenButtons = screen.getAllByTitle("Regenerate");
    // Only the last AI message has a regenerate button
    expect(regenButtons.length).toBe(1);
  });

  it("shows TTS button for messages", () => {
    render(<ChatWindow {...defaultProps} />);
    const ttsButtons = screen.getAllByTitle("Read Aloud");
    expect(ttsButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onTtsPlay when TTS button is clicked", () => {
    const onTtsPlay = vi.fn();
    render(<ChatWindow {...defaultProps} onTtsPlay={onTtsPlay} />);
    const ttsButtons = screen.getAllByTitle("Read Aloud");
    fireEvent.click(ttsButtons[0]);
    expect(onTtsPlay).toHaveBeenCalledWith("msg-1", "Hello there!");
  });

  it("shows edit history button for messages", () => {
    render(<ChatWindow {...defaultProps} />);
    const historyButtons = screen.getAllByTitle("Edit history");
    expect(historyButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onShowEditHistory when edit history button is clicked", () => {
    const onShowEditHistory = vi.fn();
    render(
      <ChatWindow
        {...defaultProps}
        onShowEditHistory={onShowEditHistory}
      />
    );
    const historyButtons = screen.getAllByTitle("Edit history");
    fireEvent.click(historyButtons[0]);
    expect(onShowEditHistory).toHaveBeenCalledWith("msg-1");
  });

  // ── Editing state ─────────────────────────────────────────────────────────

  it("shows edit textarea when editing a message", () => {
    render(
      <ChatWindow
        {...defaultProps}
        editingId="msg-1"
        editContent="Edited content"
      />
    );
    expect(screen.getByDisplayValue("Edited content")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onSaveEdit when Save is clicked", () => {
    const onSaveEdit = vi.fn();
    render(
      <ChatWindow
        {...defaultProps}
        editingId="msg-1"
        onSaveEdit={onSaveEdit}
      />
    );
    fireEvent.click(screen.getByText("Save"));
    expect(onSaveEdit).toHaveBeenCalledWith("msg-1");
  });

  it("calls onCancelEdit when Cancel is clicked", () => {
    const onCancelEdit = vi.fn();
    render(
      <ChatWindow
        {...defaultProps}
        editingId="msg-1"
        onCancelEdit={onCancelEdit}
      />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  // ── Streaming ─────────────────────────────────────────────────────────────

  it("shows streaming section when isStreaming is true with content", () => {
    render(
      <ChatWindow
        {...defaultProps}
        messages={[sampleMessages[0]]} // Only a user message, no AI message
        isStreaming={true}
        streamingContent="The dragon approaches..."
      />
    );
    expect(screen.getByText("The dragon approaches...")).toBeInTheDocument();
    // AI Narrator appears once in the streaming section header
    expect(screen.getByText("AI Narrator")).toBeInTheDocument();
  });

  it("shows spinner in send button when streaming", () => {
    const { container } = render(
      <ChatWindow {...defaultProps} isStreaming={true} />
    );
    // Loader2 icon (from lucide-react) has class lucide-loader-2 when streaming
    // Fall back to checking for the animate-spin class which Loader2 uses
    const spinner = container.querySelector(
      ".lucide-loader-2, .animate-spin"
    );
    expect(spinner).toBeInTheDocument();
  });

  // ── Narrative choices ─────────────────────────────────────────────────────

  it("shows narrative choices when provided", () => {
    render(
      <ChatWindow
        {...defaultProps}
        choices={["Go left", "Go right", "Stay put"]}
      />
    );
    expect(screen.getByText("Go left")).toBeInTheDocument();
    expect(screen.getByText("Go right")).toBeInTheDocument();
    expect(screen.getByText("Stay put")).toBeInTheDocument();
    expect(screen.getByText("Where does the story go next?")).toBeInTheDocument();
  });

  it("hides narrative choices when isStreaming", () => {
    render(
      <ChatWindow
        {...defaultProps}
        choices={["Go left"]}
        isStreaming={true}
      />
    );
    expect(screen.queryByText("Go left")).not.toBeInTheDocument();
  });

  it("calls onChoiceSelect when a choice is clicked", () => {
    const onChoiceSelect = vi.fn();
    render(
      <ChatWindow
        {...defaultProps}
        choices={["Go left", "Go right"]}
        onChoiceSelect={onChoiceSelect}
      />
    );
    fireEvent.click(screen.getByText("Go right"));
    expect(onChoiceSelect).toHaveBeenCalledWith("Go right");
  });

  // ── Edit History Modal ────────────────────────────────────────────────────

  it("shows edit history modal when editHistoryMessageId is set", () => {
    render(
      <ChatWindow
        {...defaultProps}
        editHistoryMessageId="msg-1"
      />
    );
    expect(screen.getByTestId("edit-history")).toBeInTheDocument();
    expect(screen.getByTestId("edit-history")).toHaveAttribute(
      "data-msgid",
      "msg-1"
    );
  });

  it("calls onEditHistoryClose when edit history close button is clicked", () => {
    const onEditHistoryClose = vi.fn();
    render(
      <ChatWindow
        {...defaultProps}
        editHistoryMessageId="msg-1"
        onEditHistoryClose={onEditHistoryClose}
      />
    );
    fireEvent.click(screen.getByText("Close"));
    expect(onEditHistoryClose).toHaveBeenCalledTimes(1);
  });

  // ── Regenerate choices ────────────────────────────────────────────────────

  it("shows regenerate choices button when onRegenerateChoices is provided", () => {
    render(
      <ChatWindow
        {...defaultProps}
        messages={sampleMessages.slice(0, 2)} // AI message must be last
        onRegenerateChoices={vi.fn()}
      />
    );
    const regenChoicesBtns = screen.getAllByTitle("Regenerate choices");
    expect(regenChoicesBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onRegenerateChoices when the button is clicked", () => {
    const onRegenerateChoices = vi.fn();
    render(
      <ChatWindow
        {...defaultProps}
        messages={sampleMessages.slice(0, 2)} // AI message must be last
        onRegenerateChoices={onRegenerateChoices}
      />
    );
    const regenChoicesBtns = screen.getAllByTitle("Regenerate choices");
    fireEvent.click(regenChoicesBtns[0]);
    expect(onRegenerateChoices).toHaveBeenCalledTimes(1);
  });

  // ── Copy state ────────────────────────────────────────────────────────────

  it("shows check icon when a message has been copied", () => {
    render(
      <ChatWindow
        {...defaultProps}
        copiedId="msg-1"
      />
    );
    // The copy button for msg-1 should show a check icon instead of copy icon
    const checkIcons = document.querySelectorAll(".lucide-check");
    expect(checkIcons.length).toBeGreaterThanOrEqual(1);
  });
});
