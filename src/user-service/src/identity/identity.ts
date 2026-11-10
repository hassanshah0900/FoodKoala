import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

/** The caller, as forwarded by api-gateway (contracts/README.md#identity-headers, ADR 0005). */
export interface Identity {
  userId: string;
  phone: string;
  roles: string[];
}

type WithIdentity = Request & { identity?: Identity };

const headersSchema = z.object({
  'x-user-id': z.uuid(),
  'x-user-phone': z.string().regex(/^\+923\d{9}$/),
  'x-user-roles': z.string().optional(),
});

/** Rejects requests without valid identity headers, i.e. ones the gateway did not authenticate. */
@Injectable()
export class IdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<WithIdentity>();
    const parsed = headersSchema.safeParse(req.headers);
    if (!parsed.success) throw new UnauthorizedException('Not signed in');

    const h = parsed.data;
    req.identity = {
      userId: h['x-user-id'],
      phone: h['x-user-phone'],
      roles: (h['x-user-roles'] ?? '').split(',').filter(Boolean),
    };
    return true;
  }
}

/** The authenticated caller. Use on handlers guarded by IdentityGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Identity => {
  const identity = ctx.switchToHttp().getRequest<WithIdentity>().identity;
  if (!identity) throw new Error('CurrentUser used without IdentityGuard');
  return identity;
});
