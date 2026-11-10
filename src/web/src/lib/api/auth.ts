import type { Tokens } from '../session-tokens';
import { post } from './http';

export interface CodeSent {
  phone: string;
  /** Seconds until the code expires. */
  expiresIn: number;
  /** Seconds until another code may be asked for. */
  resendIn: number;
}

export interface Session extends Tokens {
  isNewUser?: boolean;
  user: { id: string; phone: string; roles: string[] };
}

/** Texts a 6-digit code to the phone (auth-service). */
export const requestCode = (phone: string) => post<CodeSent>('auth/otp/request', { phone });

export const verifyCode = (phone: string, code: string) => post<Session>('auth/otp/verify', { phone, code });

/** A new token pair for a refresh token, which is used up. */
export const refreshSession = (refreshToken: string) => post<Session>('auth/token/refresh', { refreshToken });

export const revoke = (refreshToken: string) => post<void>('auth/logout', { refreshToken });
