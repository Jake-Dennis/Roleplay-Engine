import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAuthToken } from '@/lib/auth-token';

export interface AuthContext {
  userId: string;
  decoded: Record<string, unknown>;
}

export async function withAuth(
  request: NextRequest
): Promise<{ auth: AuthContext } | { error: Response }> {
  const token = getAuthToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const decoded = await verifyToken(token);
  if (!decoded) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }

  return {
    auth: {
      userId: decoded.sub,
      decoded: decoded as unknown as Record<string, unknown>,
    },
  };
}
