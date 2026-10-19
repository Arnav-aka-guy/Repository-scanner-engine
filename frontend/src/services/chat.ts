import { apiGet, apiPostStream, apiDelete } from './api';

export interface ChatHistoryResponse {
  timestamp: string;
  question: string;
  answer: string;
}


export async function sendChatMessageStream(
  question: string,
  repoPath: string,
  onChunk: (chunk: string) => void,
  onClose?: () => void,
  conversationId?: string,
  onDone?: (payload?: { sources?: unknown[]; content?: string }) => void
): Promise<void> {
  return apiPostStream(
    '/chat/',
    { question, repo_path: repoPath, conversation_id: conversationId },
    onChunk,
    onClose,
    onDone
  );
}

export async function getChatHistory(
  repoPath?: string,
  conversationId?: string
): Promise<ChatHistoryResponse[]> {
  const params: Record<string, string> = {};
  if (repoPath) {
    params.repo_path = repoPath;
  }
  if (conversationId) {
    params.conversation_id = conversationId;
  }
  return apiGet<ChatHistoryResponse[]>('/chat/history', params);
}

export async function clearChatHistoryApi(
  repoPath?: string,
  conversationId?: string
): Promise<{ status: string; message: string }> {
  const params: Record<string, string> = {};
  if (repoPath) params.repo_path = repoPath;
  if (conversationId) params.conversation_id = conversationId;
  return apiDelete('/chat/history', params);
}
