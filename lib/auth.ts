// Username + password accounts. Sessions are a signed JWT in an httpOnly cookie; the multiplayer server accepts a
// short-lived token minted from the same secret.
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'cb_session';
const SESSION_DAYS = 30;

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72; // bcrypt only uses the first 72 bytes

export function checkCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) return 'Username must be 3-16 letters, numbers or underscores';
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return 'Password is too long';
  return null;
}

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is not set. Set it to a long random string.');
    return new TextEncoder().encode('dev-only-secret-change-me-dev-only-secret');
  }
  if (s.length < 24) throw new Error('SESSION_SECRET must be at least 24 characters');
  return new TextEncoder().encode(s);
};

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
// when the username does not exist we still run a bcrypt compare, so a missing user and a wrong password take the same time
let dummy: Promise<string> | null = null;
export async function verifyPassword(pw: string, hash: string | null) {
  dummy ??= bcrypt.hash('not-a-real-password', 10);
  const ok = await bcrypt.compare(pw, hash || (await dummy));
  return ok && !!hash;
}

export interface Session { uid: string; username: string }

async function sign(claims: Session & { aud: string }, ttl: string) {
  return new SignJWT({ username: claims.username }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.uid).setAudience(claims.aud).setIssuedAt().setExpirationTime(ttl).sign(secret());
}
export const signSession = (s: Session) => sign({ ...s, aud: 'session' }, `${SESSION_DAYS}d`);
/** Five-minute token the browser hands to the multiplayer server when it connects. */
export const signGameToken = (s: Session) => sign({ ...s, aud: 'game' }, '5m');

export async function verifyToken(token: string | undefined | null, aud: 'session' | 'game'): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: aud, algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { uid: payload.sub, username: String(payload.username || '') };
  } catch { return null; }
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_DAYS * 86400,
});
