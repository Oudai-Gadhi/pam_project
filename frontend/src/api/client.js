import axios from 'axios';
import keycloak from '../keycloak';
import { getAppConfig } from '../config';

const apiClient = axios.create({
  baseURL: getAppConfig().apiBaseUrl,
});

apiClient.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(30);
    } catch {
      keycloak.login({ redirectUri: `${window.location.origin}/` });
      return Promise.reject(new Error('Session expired'));
    }
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

export async function fetchMe() {
  const response = await apiClient.get('/api/me');
  return response.data;
}

export default apiClient;
