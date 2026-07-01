import axios from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  updateAccessToken,
  clearTabAuth,
} from '../utils/authStorage';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const url = originalRequest?.url || '';

      if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, {
            headers: { Authorization: `Bearer ${refreshToken}` },
          });

          const newToken = res.data.access_token;
          updateAccessToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch {
          // Refresh also failed — force logout in this tab only
        }
      }

      clearTabAuth();
      const base = import.meta.env.VITE_BASE_PATH || '';
      const loginPath = `${base}/login`;
      if (!window.location.pathname.endsWith('/login')) {
        window.location.href = loginPath;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
