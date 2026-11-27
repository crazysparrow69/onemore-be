import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

export function createNeonJwks(neonAuthUrl: string): JWTVerifyGetKey {
  const base = neonAuthUrl.replace(/\/$/, '');
  return createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`));
}
