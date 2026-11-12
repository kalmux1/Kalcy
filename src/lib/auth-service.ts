/**
 * auth-service.ts
 *
 * Local-only WebAuthn + PIN abstraction for Kalcy.
 *
 * Security model (read this before changing anything):
 * ─────────────────────────────────────────────────────
 *  • WebAuthn is used purely as a **local lock gate** — no server is involved.
 *  • The credential's private key never leaves the authenticator. We only
 *    persist the *credential ID* (public info) in `localStorage`.
 *  • A backup PIN is hashed with PBKDF2‑SHA256 (100 000 iterations) using a
 *    random 16‑byte salt. Only the derived hash + salt are stored.
 *  • Nothing in this module talks to Firestore. Auth settings are device‑
 *    scoped: they live under `kalcy.authSettings.<uid>` in localStorage.
 */

export interface AuthSettings {
  webauthnEnabled: boolean;
  webauthnCredentialId: string | null;
  pinEnabled: boolean;
  pinHash: string | null;
  pinSalt: string | null;
}

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  webauthnEnabled: false,
  webauthnCredentialId: null,
  pinEnabled: false,
  pinHash: null,
  pinSalt: null,
};

/* -------------------------------------------------------------------------- */
/*  Base64URL helpers                                                         */
/* -------------------------------------------------------------------------- */

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/* -------------------------------------------------------------------------- */
/*  Availability                                                              */
/* -------------------------------------------------------------------------- */

export async function isSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (typeof window.PublicKeyCredential === 'undefined') return false;
  if (!window.isSecureContext) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Error normalisation                                                       */
/* -------------------------------------------------------------------------- */

function normalizeError(err: unknown): Error {
  const e = err as { name?: string; message?: string };
  switch (e?.name) {
    case 'NotAllowedError':
      return new Error('Authentication was cancelled or timed out.');
    case 'InvalidStateError':
      return new Error(
        'A credential for this device is already registered. Disable then re-enable biometrics to reset.'
      );
    case 'NotSupportedError':
      return new Error('WebAuthn is not supported on this device.');
    case 'SecurityError':
      return new Error(
        'WebAuthn requires a secure context (HTTPS or localhost).'
      );
    case 'ConstraintError':
      return new Error(
        'Your device does not meet the authenticator requirements.'
      );
    default:
      return new Error(e?.message ?? 'Authentication failed.');
  }
}

/* -------------------------------------------------------------------------- */
/*  WebAuthn — registration                                                   */
/* -------------------------------------------------------------------------- */

export async function registerCredential(
  userId: string,
  userName: string,
  displayName: string
): Promise<{ id: string }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);

  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'Kalcy',
    },
    user: {
      id: userIdBytes,
      name: userName,
      displayName: displayName || userName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
      requireResidentKey: false,
    },
    timeout: 60_000,
    attestation: 'none',
  };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: creationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Registration was cancelled.');
    }

    return { id: credential.id };
  } catch (err) {
    throw normalizeError(err);
  }
}

/* -------------------------------------------------------------------------- */
/*  WebAuthn — authentication                                                 */
/* -------------------------------------------------------------------------- */

export async function authenticateCredential(
  credentialId: string
): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    allowCredentials: [
      {
        id: base64UrlToBuffer(credentialId),
        type: 'public-key',
        transports: ['internal'],
      },
    ],
    userVerification: 'required',
    timeout: 60_000,
  };

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: requestOptions,
    })) as PublicKeyCredential | null;
    return !!assertion;
  } catch (err) {
    const e = err as { name?: string };
    if (e?.name === 'NotAllowedError') return false;
    throw normalizeError(err);
  }
}

/* -------------------------------------------------------------------------- */
/*  PIN — hashing & verification                                              */
/* -------------------------------------------------------------------------- */

const PIN_PBKDF2_ITERATIONS = 100_000;
const PIN_SALT_BYTES = 16;

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function hashPin(
  pin: string,
  salt?: Uint8Array
): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(
    salt ?? crypto.getRandomValues(new Uint8Array(PIN_SALT_BYTES))
  );
  const pinBytes = new TextEncoder().encode(pin);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PIN_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return {
    hash: bufferToBase64Url(derivedBits),
    salt: bufferToBase64Url(saltBytes),
  };
}

export async function verifyPin(
  pin: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const saltBytes = new Uint8Array(base64UrlToBuffer(storedSalt));
  const { hash } = await hashPin(pin, saltBytes);
  return constantTimeCompare(hash, storedHash);
}

/* -------------------------------------------------------------------------- */
/*  localStorage persistence (per‑user, per‑device)                           */
/* -------------------------------------------------------------------------- */

const STORAGE_PREFIX = 'kalcy.authSettings.';

export function loadAuthSettings(uid: string): AuthSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + uid);
    if (!raw) return { ...DEFAULT_AUTH_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AuthSettings>;
    return { ...DEFAULT_AUTH_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_AUTH_SETTINGS };
  }
}

export function saveAuthSettings(uid: string, settings: AuthSettings): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to persist auth settings', err);
  }
}

export function clearAuthSettings(uid: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + uid);
  } catch (err) {
    console.error('Failed to clear auth settings', err);
  }
}