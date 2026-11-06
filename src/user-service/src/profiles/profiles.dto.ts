import { z } from 'zod';

// Shapes match ProfileUpdate in contracts/openapi/user-service.yaml.
export const profileUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100).nullable(),
    email: z.email().max(254).toLowerCase().nullable(),
    preferredLanguage: z.enum(['en', 'ur']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'send at least one field');

export type ProfileUpdateDto = z.output<typeof profileUpdateSchema>;
