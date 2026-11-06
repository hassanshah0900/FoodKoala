import { z } from 'zod';
import { phoneSchema } from '../phone/phone';

// Shapes match contracts/openapi/auth-service.yaml.
export const otpRequestSchema = z.strictObject({ phone: phoneSchema });
export type OtpRequestDto = z.output<typeof otpRequestSchema>;

export const otpVerifySchema = z.strictObject({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
});
export type OtpVerifyDto = z.output<typeof otpVerifySchema>;

export const refreshTokenSchema = z.strictObject({ refreshToken: z.string().min(1) });
export type RefreshTokenDto = z.output<typeof refreshTokenSchema>;
