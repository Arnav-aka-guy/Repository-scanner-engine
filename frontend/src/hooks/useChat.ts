import { useState, useCallback } from 'react';
import { ChatMessage } from '../types/chat';
import { sendChatMessageStream } from '../services/chat';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (question: string, repoPath: string) => {
    if (!question || !repoPath) return;

    setLoading(true);
    setError(null);

    // 1. Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 2. Add empty assistant message placeholder for streaming
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      await sendChatMessageStream(
        question,
        repoPath,
        (chunk: string) => {
          // Accumulate chunk in assistant message content
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
        },
        () => {
          // Stream completed successfully
          setLoading(false);
        }
      );
    } catch (err: any) {
      setError(err.message || 'Error occurred during streaming.');
      setLoading(false);
      // Update assistant message to show error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: msg.content + '\n\n*Error: Failed to stream response.*' }
            : msg
        )
      );
    }
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearHistory,
  };
}
