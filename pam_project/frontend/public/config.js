// Overwritten at Docker container startup with your VM IP (see docker-entrypoint.sh)
window.__PAM_CONFIG__ = {
  keycloakUrl: 'http://REPLACE-WITH-VM-IP:8080',
  keycloakRealm: 'pam',
  keycloakClientId: 'pam-app',
  apiBaseUrl: 'http://REPLACE-WITH-VM-IP:8000',
};
