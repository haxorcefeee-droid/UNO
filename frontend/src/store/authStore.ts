import { create } from 'zustand';
import { User } from '../types';
import { authApi } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
  clearError: () => void;
  updateCoins: (coins: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login(email, password);
      const { token, user } = res.data;
      localStorage.setItem('uno_token', token);
      set({ user, token, isLoading: false });
      connectSocket();
    } catch (err: any) {
      set({ error: err.response?.data?.error ?? 'Login failed', isLoading: false });
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.register(username, email, password);
      const { token, user } = res.data;
      localStorage.setItem('uno_token', token);
      set({ user, token, isLoading: false });
      connectSocket();
    } catch (err: any) {
      set({ error: err.response?.data?.error ?? 'Registration failed', isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('uno_token');
    disconnectSocket();
    set({ user: null, token: null });
  },

  loadFromStorage: async () => {
    const token = localStorage.getItem('uno_token');
    if (!token) return;
    set({ isLoading: true });
    try {
      const res = await authApi.me();
      set({ user: res.data.user, token, isLoading: false });
      connectSocket();
    } catch {
      localStorage.removeItem('uno_token');
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),

  updateCoins: (coins: number) =>
    set(s => s.user ? { user: { ...s.user, coins } } : {}),
}));
