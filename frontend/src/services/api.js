import axios from 'axios';

const api = axios.create({
  // لوكال: VITE_API_URL فارغ → يستخدم Proxy (/api → localhost:5000)
  // خارجي: VITE_API_URL=https://xxx.ngrok-free.dev/api
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('samh_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle expired token globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('samh_token');
      localStorage.removeItem('samh_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
