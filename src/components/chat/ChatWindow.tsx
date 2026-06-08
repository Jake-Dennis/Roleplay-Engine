"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";

interface Message {
  id: string;
  content: string;
  sender_name: string | null;
  sender_id: string | null;
  timestamp: string;
}

interface ChatWindowProps {
  sessionId: string;
  initialMessages: Message[];
  userId: string;
}

export function ChatWindow({ sessionId, initialMessages, userId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  async function handleSend(content: string) {
    // Add user message immediately
    const userMsg: Message = {
      id: crypto.randomUUID(),
      content,
      sender_name: "You",
      sender_id: userId,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Build context from recent messages
    const recentMessages = messages.slice(-10);
    const context = {
      recentMessages,
      sceneState: null,
      relationships: [],
      lore: [],
      canonRules: "",
    };

    // Start streaming generation
    setIsGenerating(true);
    setStreamingMessage({
      id: "streaming",
      content: "",
      sender_name: "AI",
      sender_id: null,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await fetch(`/api/generate/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: content, context }),
      });

      if (!response.ok) {
        throw new Error("Generation failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.chunk) {
                fullContent += data.chunk;
                setStreamingMessage((prev) =>
                  prev ? { ...prev, content: fullContent } : null
                );
              }
              if (data.done && data.messageId) {
                // Finalize the message
                setMessages((prev) => [
                  ...prev,
                  {
                    id: data.messageId,
                    content: fullContent,
                    sender_name: "AI",
                    sender_id: null,
                    timestamp: new Date().toISOString(),
                  },
                ]);
                setStreamingMessage(null);
              }
              if (data.error) {
                throw new Error(data.error);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      console.error("Generation error:", error);
      setStreamingMessage(null);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAction(action: string, messageId: string, data?: string) {
    switch (action) {
      case "tts":
        // TTS handled by parent or global state
        console.log("TTS for message:", messageId);
        break;

      case "copy":
        await navigator.clipboard.writeText(
          messages.find((m) => m.id === messageId)?.content || ""
        );
        break;

      case "edit":
        if (!data) return;
        try {
          const res = await fetch(`/api/sessions/${sessionId}/messages/${messageId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: data, regenerate: true }),
          });

          if (res.ok) {
            // Remove all messages after the edited one
            const editedIndex = messages.findIndex((m) => m.id === messageId);
            const updatedMessages = messages.slice(0, editedIndex + 1);
            updatedMessages[editedIndex] = {
              ...updatedMessages[editedIndex],
              content: data,
            };
            setMessages(updatedMessages);
          }
        } catch (error) {
          console.error("Edit error:", error);
        }
        break;

      case "regenerate":
        try {
          const res = await fetch(`/api/sessions/${sessionId}/messages/${messageId}/regenerate`, {
            method: "POST",
          });

          if (res.ok) {
            // Remove the message and all after it
            const regenIndex = messages.findIndex((m) => m.id === messageId);
            setMessages(messages.slice(0, regenIndex));
          }
        } catch (error) {
          console.error("Regenerate error:", error);
        }
        break;

      case "delete":
        if (!confirm("Delete this message and all messages after it?")) return;
        try {
          const res = await fetch(`/api/sessions/${sessionId}/messages/${messageId}`, {
            method: "DELETE",
          });

          if (res.ok) {
            const deleteIndex = messages.findIndex((m) => m.id === messageId);
            setMessages(messages.slice(0, deleteIndex));
          }
        } catch (error) {
          console.error("Delete error:", error);
        }
        break;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !streamingMessage && (
          <div className="flex items-center justify-center h-full text-text-muted">
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            {...msg}
            onAction={handleAction}
          />
        ))}

        {streamingMessage && (
          <MessageBubble
            {...streamingMessage}
            isStreaming={true}
            onAction={handleAction}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={handleSend} disabled={isGenerating} />
    </div>
  );
}
