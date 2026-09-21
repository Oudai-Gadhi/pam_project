import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import keycloak from '../keycloak';

const KeycloakContext = createContext(null);

export function KeycloakProvider({ children }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    keycloak
      .init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        // Silent iframe checks often fail cross-origin in Docker; disable to avoid spurious logouts
        checkLoginIframe: false,
      })
      .then((auth) => {
        setAuthenticated(auth);
        setInitialized(true);
      })
      .catch(() => {
        setAuthenticated(false);
        setInitialized(true);
      });

    // Proactively refresh before expiry so API calls don't fail mid-session
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        keycloak.login();
      });
    };
  }, []);

  const value = useMemo(
    () => ({
      initialized,
      authenticated,
      keycloak,
    }),
    [initialized, authenticated],
  );

  return <KeycloakContext.Provider value={value}>{children}</KeycloakContext.Provider>;
}

export function useKeycloak() {
  const context = useContext(KeycloakContext);
  if (!context) {
    throw new Error('useKeycloak must be used within KeycloakProvider');
  }
  return context;
}

/**
 * Read group memberships from the ACCESS token (not ID token).
 * Requires the Keycloak "Group Membership" mapper on the pam-app client scope.
 */
export function getGroupsFromToken() {
  return keycloak.tokenParsed?.groups ?? [];
}

export function hasGroup(groupName) {
  return getGroupsFromToken().includes(groupName);
}
