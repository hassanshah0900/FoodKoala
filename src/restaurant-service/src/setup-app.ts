import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';

/** App-wide setup shared by main.ts and the e2e tests. */
export function setupApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
