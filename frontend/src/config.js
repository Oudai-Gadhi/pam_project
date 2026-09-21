/**
 * Runtime config is injected via /config.js when running in Docker (no rebuild needed).
 * Vite env vars are the fallback for local `npm run dev`.
 */
export function getAppConfig() {
  const runtime = typeof window !== 'undefined' ? window.__PAM_CONFIG__ : null;

  return {
    keycloakUrl: runtime?.keycloakUrl || import.meta.env.VITE_KEYCLOAK_URL || '',
    keycloakRealm: runtime?.keycloakRealm || import.meta.env.VITE_KEYCLOAK_REALM || 'pam',
    keycloakClientId:
      runtime?.keycloakClientId || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'pam-app',
    apiBaseUrl: runtime?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '',
  };
}

export function validateAppConfig(config = getAppConfig()) {
  if (!config.keycloakUrl) {
    return 'Keycloak URL is missing. Set VITE_KEYCLOAK_URL or configure /config.js.';
  }
  if (!config.keycloakRealm) {
    return 'Keycloak realm is missing.';
  }
  if (!config.keycloakClientId) {
    return 'Keycloak client ID is missing.';
  }
  return null;
}
