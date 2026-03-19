import axios from 'axios';

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

export function getApiBaseUrl() {
  const env = process.env.EXPO_PUBLIC_API_URL;
  return normalizeBaseUrl(env && env.trim() ? env.trim() : 'http://localhost:8080');
}

export function getWsBaseUrl() {
  const env = process.env.EXPO_PUBLIC_WS_URL;
  return normalizeBaseUrl(env && env.trim() ? env.trim() : 'ws://localhost:8080');
}

export const http = axios.create({
  baseURL: getApiBaseUrl() + '/api',
  timeout: 15000,
});

export function setAuthToken(token: string | null) {
  if (token) {
    http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete http.defaults.headers.common['Authorization'];
  }
}

export function wsUrl(token?: string) {
  const base = getWsBaseUrl();
  const path = token ? `/api/delivery/ws?token=${encodeURIComponent(token)}` : '/api/delivery/ws';
  return base + path;
}

