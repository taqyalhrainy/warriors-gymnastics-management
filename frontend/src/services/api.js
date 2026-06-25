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

    if (!shouldRetryRequest(error)) {
      return Promise.reject(error);
    }

    config.__retryCount = config.__retryCount || 0;
    const maxRetries = config.__maxRetries ?? 12;

    if (config.__retryCount >= maxRetries) {
      return Promise.reject(error);
    }

    config.__retryCount += 1;
    const delay = Math.min(2500 + (config.__retryCount - 1) * 750, 7000);
    await sleep(delay);

    return api(config);
  }
);

export const waitForApiHealth = async (options = {}) => {
  const timeout = options.timeout ?? 10000;
  const maxRetries = options.maxRetries ?? 30;
  const response = await api.get('/health', {
    timeout,
    __maxRetries: maxRetries
  });
  return response.data;
};

const token = localStorage.getItem('warriors-token');
if (token) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export default api;
