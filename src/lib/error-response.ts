import { NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV === 'development';

export function errorResponse(message: string, status: number, details?: unknown): Response {
  const body: Record<string, unknown> = { error: message };
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
