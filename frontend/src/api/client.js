import axios from 'axios';
import keycloak from '../keycloak';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Attach a fresh access token to every request — backend validates signature server-side
apiClient.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(30);
    } catch {
      keycloak.login();
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
