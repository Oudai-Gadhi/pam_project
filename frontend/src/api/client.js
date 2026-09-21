import axios from 'axios';
import keycloak from '../keycloak';
import { getAppConfig } from '../config';

function resolveApiBaseUrl() {
  const configured = getAppConfig().apiBaseUrl;
  if (configured) {
    return configured;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

const apiClient = axios.create();

apiClient.interceptors.request.use(async (config) => {
  config.baseURL = resolveApiBaseUrl();

  if (keycloak.authenticated) {
    if (!keycloak.token) {
      return Promise.reject(new Error('No access token is available for this session.'));
    }

    // A code-login has just supplied a valid access token. Avoid making an
    // unnecessary cross-origin refresh request before the first API call.
    // KeycloakContext refreshes when the token actually expires; this branch
    // only refreshes proactively when the current token is nearly expired.
    if (keycloak.isTokenExpired(30)) {
      try {
        await keycloak.updateToken(30);
      } catch {
        keycloak.login({ redirectUri: `${window.location.origin}/` });
        return Promise.reject(new Error('Session expired'));
      }
    }

    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

export async function fetchMe() {
  try {
    const response = await apiClient.get('/api/me');
    return response.data;
  } catch (error) {
    if (error.response) {
      const detail = error.response.data?.detail;
      throw new Error(
        typeof detail === 'string' ? detail : `API error ${error.response.status}`,
      );
    }
    if (error.request) {
      throw new Error(
        `Cannot reach API at ${resolveApiBaseUrl()}/api/me — check docker compose and nginx proxy.`,
      );
    }
    throw error;
  }
}

export default apiClient;
