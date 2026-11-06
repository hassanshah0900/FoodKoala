import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  readiness() {
    // Add dependency checks (database, Kafka) here as they are introduced.
    return { status: 'ok' };
  }
}
