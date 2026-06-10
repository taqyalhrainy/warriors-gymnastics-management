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
  headers: {
    'Content-Type': 'application/json'
  }
});

const token = localStorage.getItem('warriors-token');
if (token) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export default api;
