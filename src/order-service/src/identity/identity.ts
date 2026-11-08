import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

/**
 * The caller's identity, or undefined for an anonymous request (no X-User-Id).
 * Headers that are present but malformed get 401: the gateway never sends those.
 */
export function readIdentity(req: Request): Identity | undefined {
  if (req.headers['x-user-id'] === undefined) return undefined;
  const parsed = headersSchema.safeParse(req.headers);
  if (!parsed.success) throw new UnauthorizedException('Not signed in');
  const h = parsed.data;
  return {
    userId: h['x-user-id'],
    phone: h['x-user-phone'],
    roles: (h['x-user-roles'] ?? '').split(',').filter(Boolean),
  };
}

export const isAdmin = (me: Identity | undefined): boolean => me?.roles.includes('admin') ?? false;

/** Rejects requests without valid identity headers, i.e. ones the gateway did not authenticate. */
@Injectable()
export class IdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<WithIdentity>();
    const identity = readIdentity(req);
    if (!identity) throw new UnauthorizedException('Not signed in');
    req.identity = identity;
    return true;
  }
}

/** Like IdentityGuard, and the caller must have the `admin` role. */
@Injectable()
export class AdminGuard extends IdentityGuard {
  override canActivate(context: ExecutionContext): boolean {
    super.canActivate(context);
    if (!isAdmin(context.switchToHttp().getRequest<WithIdentity>().identity)) {
      throw new ForbiddenException('Admins only');
    }
    return true;
  }
}

/** The authenticated caller. Use on handlers guarded by IdentityGuard or AdminGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Identity => {
  const identity = ctx.switchToHttp().getRequest<WithIdentity>().identity;
  if (!identity) throw new Error('CurrentUser used without IdentityGuard');
  return identity;
});

/** The caller if signed in, for public routes that show more to owners and admins. */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Identity | undefined => readIdentity(ctx.switchToHttp().getRequest<Request>()),
);
