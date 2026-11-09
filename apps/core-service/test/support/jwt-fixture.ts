import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';

export const TEST_AUTH_URL = 'https://auth.example.test/neondb/auth';
export const TEST_AUTH_ORIGIN = 'https://auth.example.test';

type SignInput = {
  sub: string;
  email?: string;
  name?: string | null;
  issuer?: string;
  audience?: string;
  expiresAt?: number;
  key?: CryptoKey;
};

export type TestJwt = {
  jwks: JWTVerifyGetKey;
  sign: (input: SignInput) => Promise<string>;
  signWithOtherKey: (input: Omit<SignInput, 'key'>) => Promise<string>;
};

export async function createTestJwt(): Promise<TestJwt> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA');
  const { privateKey: otherKey } = await generateKeyPair('EdDSA');
  const jwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({
    keys: [{ ...jwk, kid: 'test', alg: 'EdDSA', use: 'sig' }],
  });

  function sign(input: SignInput): Promise<string> {
    const claims: Record<string, unknown> = {};
    if (input.email !== undefined) {
      claims.email = input.email;
    }
    if (input.name !== undefined) {
      claims.name = input.name;
    }
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
      .setSubject(input.sub)
      .setIssuer(input.issuer ?? TEST_AUTH_ORIGIN)
      .setAudience(input.audience ?? TEST_AUTH_ORIGIN)
      .setIssuedAt();
    if (input.expiresAt === undefined) {
      jwt.setExpirationTime('15m');
    } else {
      jwt.setExpirationTime(input.expiresAt);
    }
    return jwt.sign(input.key === undefined ? privateKey : input.key);
  }

  return {
    jwks,
    sign,
    signWithOtherKey: (input) => sign({ ...input, key: otherKey }),
  };
}
