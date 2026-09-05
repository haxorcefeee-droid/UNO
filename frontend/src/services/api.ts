import axios from 'axios';
import { User } from '../types';

const api = axios.create({
  baseURL: '/api',
});

// Attach JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('uno_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  register: (username: string, email: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { username, email, password }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  me: () => api.get<{ user: User }>('/auth/me'),
};

export default api;
