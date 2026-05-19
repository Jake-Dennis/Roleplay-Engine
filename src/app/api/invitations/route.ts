import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from '@/lib/auth-token';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();

  const invitations = db.prepare(`
    SELECT i.id, i.status, i.created_at,
      s.id as session_id, s.name as session_name,
      u.id as inviter_id, u.username as inviter_username
    FROM invitations i
    JOIN sessions s ON i.session_id = s.id
    JOIN users u ON i.inviter_id = u.id
    WHERE i.invitee_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC
  `).all(decoded.sub);

  return NextResponse.json({ invitations });
}
