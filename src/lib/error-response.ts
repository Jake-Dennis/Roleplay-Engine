import { NextResponse } from 'next/server';
import { getCorrelationId } from './logger';

const isDev = process.env.NODE_ENV === 'development';

function getRequestId(): string {
  return getCorrelationId() ?? crypto.randomUUID();
}

export function errorResponse(message: string, status: number, details?: unknown): Response {
  const body: Record<string, unknown> = { error: message, requestId: getRequestId() };
  if (isDev && details) {
    body.details = details instanceof Error ? details.message : String(details);
  }
  return NextResponse.json(body, { status });
}

export function notFoundError(resource: string): Response {
  return errorResponse(`${resource} not found`, 404);
}

export function unauthorizedError(): Response {
  return errorResponse('Unauthorized', 401);
}

export function forbiddenError(): Response {
  return errorResponse('Forbidden', 403);
}

export function badRequestError(message: string): Response {
  return errorResponse(message, 400);
}

export function internalError(): Response {
  return errorResponse('Internal server error', 500);
}

export function serverError(error: unknown): Response {
  console.error(error);
  return errorResponse('Internal server error', 500, error);
}

export function requireJson(request: Request): void {
  const contentType = request.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw errorResponse('Unsupported Media Type. Content-Type must be application/json', 415);
  }
}
