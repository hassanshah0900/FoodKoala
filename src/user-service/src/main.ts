import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true, context: 'user-service' }),
  });
  app.enableShutdownHooks();
  await app.listen(config.PORT);
}

void bootstrap();
