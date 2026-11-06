import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { RateLimitedFilter } from './common/rate-limited.exception';

/** App-wide pipes and filters, shared by main.ts and the e2e tests. */
export function setupApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new RateLimitedFilter());
  app.enableShutdownHooks();
  return app;
}
