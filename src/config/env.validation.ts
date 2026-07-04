/**
 * Boot-time environment validation. Throwing here aborts startup, so the API
 * never runs with an insecure JWT configuration.
 */
const WEAK_SECRETS = new Set(['change-me-in-production', 'secret', 'changeme', '']);

export interface AppEnv {
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const secret = String(config.JWT_SECRET ?? '');

  if (!secret || WEAK_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET is missing or set to a well-known placeholder. ' +
        'Set a strong, unique secret (e.g. `openssl rand -base64 48`).',
    );
  }
  if (secret.length < 32) {
    throw new Error(`JWT_SECRET is too short (${secret.length} chars); use at least 32.`);
  }

  return {
    JWT_SECRET: secret,
    JWT_EXPIRES_IN: String(config.JWT_EXPIRES_IN ?? '1d'),
    JWT_ISSUER: String(config.JWT_ISSUER ?? 'dafater-api'),
    JWT_AUDIENCE: String(config.JWT_AUDIENCE ?? 'dafater-app'),
  };
}
