import { logger } from '@/lib/logger';
import { serverError } from '@/lib/error-response';

type RouteHandler = (...args: any[]) => Promise<Response>;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err: unknown) {
      logger.error('Unhandled error in route handler', err);
      return serverError(err);
    }
  };
}
