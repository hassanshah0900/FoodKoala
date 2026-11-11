/** Where the stack started by `make e2e-up` answers; override to point the tests elsewhere. */
export const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';
export const SMS_URL = process.env.E2E_SMS_URL ?? 'http://localhost:4010';
