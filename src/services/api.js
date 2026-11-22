import axios from 'axios';

// Set VITE_API_URL (and VITE_WS_URL) in .env for deployments, e.g.
//   VITE_API_URL=https://terminal.example.com
//   VITE_WS_URL=wss://terminal.example.com
export const API_URL = import.meta.env.VITE_API_URL || 'https://intelligent-bus-system-backend.onrender.com';
export const WS_URL =
  import.meta.env.VITE_WS_URL || API_URL.replace(/^http/, 'ws');

const api = axios.create({ baseURL: API_URL });

// Automatically attach the token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// An expired token sends the user back to login instead of leaving broken pages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default api;