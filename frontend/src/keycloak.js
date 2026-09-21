import Keycloak from 'keycloak-js';
import { installCryptoPolyfill } from './crypto-polyfill';
import { getAppConfig, validateAppConfig } from './config';

installCryptoPolyfill();

const config = getAppConfig();

const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClientId,
});

let initPromise = null;

/**
 * Secure context = HTTPS or http://localhost.
 * http://192.168.x.x over plain HTTP is NOT secure — crypto.subtle is blocked.
 */
export function isSecureContext() {
  if (typeof window !== 'undefined' && window.isSecureContext) {
    return window.isSecureContext;
  }
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

function getInitOptions() {
  const secure = isSecureContext();

  const options = {
    checkLoginIframe: false,
    enableLogging: import.meta.env.DEV,
    // MUST be explicit false — keycloak-js defaults to S256 if omitted
    pkceMethod: secure ? 'S256' : false,
  };

  // check-sso triggers a hidden login during init which also needs crypto
  if (secure) {
    options.onLoad = 'check-sso';
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
