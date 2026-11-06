import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/** 429 that also tells the client when to retry. */
export class RateLimitedException extends HttpException {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, error: 'Too Many Requests', message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Catch(RateLimitedException)
export class RateLimitedFilter implements ExceptionFilter<RateLimitedException> {
  catch(exception: RateLimitedException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .setHeader('Retry-After', String(Math.max(1, exception.retryAfterSeconds)))
      .json(exception.getResponse());
  }
}
