/**
 * keycloak-js uses crypto.randomUUID() for OAuth state/nonce.
 * Browsers only expose randomUUID in secure contexts (HTTPS or localhost).
 * http://192.168.x.x from Windows is NOT secure — polyfill via getRandomValues,
 * which remains available on plain HTTP.
 */
export function installCryptoPolyfill() {
  if (typeof globalThis.crypto === 'undefined') {
    return;
  }

  if (typeof globalThis.crypto.randomUUID !== 'function') {
    globalThis.crypto.randomUUID = function randomUUID() {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
  }
}

// Run immediately when this module is first imported
installCryptoPolyfill();
