import Keycloak from 'keycloak-js';

/**
 * Singleton Keycloak instance — one adapter per tab avoids duplicate init/login flows.
 * Keycloak runs on the same VM; browser redirects to localhost:8080.
 */
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});

export default keycloak;
