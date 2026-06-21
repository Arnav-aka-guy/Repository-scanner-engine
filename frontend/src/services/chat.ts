import { apiGet, apiPostStream } from './api';

export interface ChatHistoryResponse {
  timestamp: string;
  question: string;
  answer: string;
}

export async function sendChatMessageStream(
  question: string,
  repoPath: string,
  onChunk: (chunk: string) => void,
  onClose?: () => void
): Promise<void> {
  return apiPostStream('/chat/', { question, repo_path: repoPath }, onChunk, onClose);
}

export async function getChatHistory(): Promise<ChatHistoryResponse[]> {
  return apiGet<ChatHistoryResponse[]>('/chat/history');
}
