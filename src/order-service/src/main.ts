import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true, context: 'order-service' }),
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3006);
  await app.listen(port);
}

void bootstrap();
