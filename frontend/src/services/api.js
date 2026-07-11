import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL?.trim();
const normalizedApiUrl = apiUrl ? apiUrl.replace(/\/+$/, '') : '';
const fallbackApiUrl = import.meta.env.PROD
  ? 'https://warriors-gymnastics-management.onrender.com/api'
  : 'http://localhost:5000/api';
const baseURL = normalizedApiUrl
  ? `${normalizedApiUrl}${normalizedApiUrl.endsWith('/api') ? '' : '/api'}`
  : fallbackApiUrl;

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const healthURL = `${baseURL}/health`;

const shouldRetryRequest = (error) => {
  const method = error.config?.method?.toLowerCase();
  const status = error.response?.status;

  return method === 'get' && (
    !error.response ||
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const status = error.response?.status;

    if (status === 401 && !config.__skipAuthInvalidation && !config.url?.includes('/auth/login')) {
      localStorage.removeItem('warriors-token');
      localStorage.removeItem('warriors-user');
      delete api.defaults.headers.common.Authorization;
      window.dispatchEvent(new Event('auth:invalid'));
    }

    if (config.__skipRetry || !shouldRetryRequest(error)) {
      return Promise.reject(error);
    }

    config.__retryCount = config.__retryCount || 0;
    const maxRetries = config.__maxRetries ?? 12;

    if (config.__retryCount >= maxRetries) {
      return Promise.reject(error);
    }

    config.__retryCount += 1;
    const delay = Math.min(500 + (config.__retryCount - 1) * 500, 3000);
    await sleep(delay);

    return api(config);
  }
);

export const waitForApiHealth = async (options = {}) => {
  const timeout = options.timeout ?? 4000;
  const maxWaitMs = options.maxWaitMs ?? 180000;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const response = await api.get('/health', {
        timeout,
        validateStatus: () => true,
        __skipRetry: true
      });

      if (response.status === 200 && response.data?.status === 'ok') {
        return response.data;
      }

      lastError = new Error(response.data?.message || `Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(pollIntervalMs);
  }

  throw lastError || new Error('Server health check timed out.');
};

export const wakeApi = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.fetch(healthURL, {
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors'
  }).catch(() => {});
};

const token = localStorage.getItem('warriors-token');
if (token) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

wakeApi();

export default api;
