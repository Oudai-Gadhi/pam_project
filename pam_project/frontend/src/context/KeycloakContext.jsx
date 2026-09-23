import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import keycloak, { initKeycloak } from '../keycloak';

const KeycloakContext = createContext(null);

export function KeycloakProvider({ children }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [initError, setInitError] = useState(null);

  useEffect(() => {
    let active = true;

    initKeycloak()
      .then((auth) => {
        if (!active) return;
        setAuthenticated(Boolean(auth));
        setInitError(null);
        setInitialized(true);
      })
      .catch((error) => {
        if (!active) return;
        setAuthenticated(false);
        setInitError(error?.message || 'Failed to connect to Keycloak');
        setInitialized(true);
      });

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        keycloak.login({ redirectUri: `${window.location.origin}/` });
      });
    };

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      initialized,
      authenticated,
      initError,
      keycloak,
    }),
    [initialized, authenticated, initError],
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

export function getGroupsFromToken() {
  return keycloak.tokenParsed?.groups ?? [];
}

export function hasGroup(groupName) {
  return getGroupsFromToken().includes(groupName);
}
