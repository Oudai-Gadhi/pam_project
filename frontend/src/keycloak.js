import Keycloak from 'keycloak-js';
import { getAppConfig, validateAppConfig } from './config';

const config = getAppConfig();

const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClientId,
});

let initPromise = null;

/**
 * PKCE (S256) needs Web Crypto API, which browsers only expose in "secure contexts":
 * HTTPS, or http://localhost — NOT http://192.168.x.x over plain HTTP.
 * When accessing the VM by IP from Windows, we skip PKCE (dev-mode fallback).
 */
export function isSecureContext() {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

function getInitOptions() {
  const options = {
    onLoad: 'check-sso',
    checkLoginIframe: false,
    enableLogging: import.meta.env.DEV,
  };

  if (isSecureContext()) {
    options.pkceMethod = 'S256';
  }

  return options;
}

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
      .init(getInitOptions())
      .catch((error) => {
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

  return keycloak.login({
    redirectUri: `${window.location.origin}/`,
  });
}

export default keycloak;
