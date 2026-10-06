import axios from 'axios';

// Get base API URL from environment variable or fallback to localhost
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Axios instance configured with base URL, credentials, and authentication interceptors.
 */
export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor:
 * Automatically reads the JWT from localStorage and attaches it to the Authorization header.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('collab_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor:
 * Catches 401 Unauthorized errors to clean up stale credentials.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear expired credentials from storage
      localStorage.removeItem('collab_token');
      localStorage.removeItem('collab_user');

      // If we are not already on auth pages, redirect to login
      if (
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/register')
      ) {
        window.location.href = '/login?expired=true';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

