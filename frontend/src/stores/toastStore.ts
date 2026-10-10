import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const duration = toast.duration ?? 4000;

    set((state) => {
      // Deduplicate: If an existing toast matches the title and message, do not stack it
      const isDuplicate = state.toasts.some(
        (t) => t.title === toast.title && t.message === toast.message && t.type === toast.type
      );
      if (isDuplicate) {
        return state;
      }

      const id = crypto.randomUUID();
      // Cap at 3 visible toasts
      const trimmed = state.toasts.length >= 3 ? state.toasts.slice(state.toasts.length - 2) : state.toasts;

      if (duration > 0) {
        setTimeout(() => {
          set((s) => ({
            toasts: s.toasts.filter((t) => t.id !== id),
          }));
        }, duration);
      }

      return {
        toasts: [...trimmed, { ...toast, id }],
      };
    });
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));
