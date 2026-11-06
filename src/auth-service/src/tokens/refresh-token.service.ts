import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database } from '../db/database';
import { refreshTokens, users, type User } from '../db/schema';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Starts a new token family (a new login). Returns the raw token, shown to the client once. */
  issue(userId: string): Promise<string> {
    return this.insert(this.db, userId, randomUUID());
  }

  /**
   * Revokes `token` and returns a new one in the same family.
   * Presenting a token that was already revoked means it leaked: the whole family is revoked.
   */
  async rotate(token: string): Promise<{ user: User; refreshToken: string }> {
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashToken(token)))
        .for('update');

      if (!row) return { error: 'Invalid refresh token' } as const;

      if (row.revokedAt) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
        return { error: 'Refresh token was already used; please log in again' } as const;
      }

      if (row.expiresAt <= new Date()) return { error: 'Refresh token expired' } as const;

      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
      const [user] = await tx.select().from(users).where(eq(users.id, row.userId));
      const refreshToken = await this.insert(tx, row.userId, row.familyId);
      return { user, refreshToken };
    });

    // Thrown after commit so the family revocation above is not rolled back.
    if ('error' in result) throw new UnauthorizedException(result.error);
    return result;
  }

  /** Revokes the token's whole family (logout). Unknown tokens are ignored. */
  async revoke(token: string): Promise<void> {
    const [row] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(token)));
    if (!row) return;
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
  }

  private async insert(db: Database | Tx, userId: string, familyId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await db.insert(refreshTokens).values({ userId, familyId, tokenHash: hashToken(token), expiresAt });
    return token;
  }
}
