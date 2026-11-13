import { apiGet, apiPostStream, apiDelete } from './api';

export interface ChatHistoryResponse {
  timestamp: string;
  question: string;
  answer: string;
}

export async function sendChatMessageStream(
  question: string,
  repoPath?: string | null,
  onChunk?: (chunk: string) => void,
  onClose?: () => void,
  conversationId?: string,
  onDone?: (payload?: { sources?: unknown[]; content?: string }) => void,
  repositoryId?: number | null
): Promise<void> {
  const payload: Record<string, unknown> = {
    question,
    conversation_id: conversationId,
  };
  if (repositoryId != null) {
    payload.repository_id = repositoryId;
  } else if (repoPath) {
    payload.repo_path = repoPath;
  }

  return apiPostStream(
    '/chat/',
    payload,
    onChunk || (() => {}),
    onClose,
    onDone
  );
}

export async function getChatHistory(
  repoPath?: string | null,
  conversationId?: string,
  repositoryId?: number | null
): Promise<ChatHistoryResponse[]> {
  const params: Record<string, string> = {};
  if (repositoryId != null) {
    params.repository_id = String(repositoryId);
  } else if (repoPath) {
    params.repo_path = repoPath;
  }
  if (conversationId) {
    params.conversation_id = conversationId;
  }
  return apiGet<ChatHistoryResponse[]>('/chat/history', params);
}

export async function clearChatHistoryApi(
  repoPath?: string | null,
  conversationId?: string,
  repositoryId?: number | null
): Promise<{ status: string; message: string }> {
  const params: Record<string, string> = {};
  if (repositoryId != null) {
    params.repository_id = String(repositoryId);
  } else if (repoPath) {
    params.repo_path = repoPath;
  }
  if (conversationId) params.conversation_id = conversationId;
  return apiDelete('/chat/history', params);
}
