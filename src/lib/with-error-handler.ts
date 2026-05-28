import { logger } from '@/lib/logger';
import { serverError } from '@/lib/error-response';

export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (err: unknown) {
      logger.error('Unhandled error in route handler', err);
      return serverError(err);
    }
  };
}
