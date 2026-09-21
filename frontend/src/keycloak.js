import Keycloak from 'keycloak-js';
import { getAppConfig, validateAppConfig } from './config';

const config = getAppConfig();

const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClientId,
});

// keycloak-js allows only ONE init() per instance — cache the promise for React StrictMode
let initPromise = null;

export function getKeycloakConfigError() {
  return validateAppConfig();
}

export function initKeycloak() {
  const configError = getKeycloakConfigError();
  if (configError) {
    return Promise.reject(new Error(configError));
  }

  if (!initPromise) {
    initPromise = keycloak
      .init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        enableLogging: import.meta.env.DEV,
      })
      .catch((error) => {
        // Allow retry after a failed init (e.g. Keycloak was still starting)
        initPromise = null;
        throw error;
      });
  }

  return initPromise;
}

export function loginWithKeycloak() {
  const configError = getKeycloakConfigError();
  if (configError) {
    return Promise.reject(new Error(configError));
  }

  // Full page redirect — must use a URL registered in the Keycloak client
  return keycloak.login({
    redirectUri: `${window.location.origin}/`,
  });
}

export default keycloak;
