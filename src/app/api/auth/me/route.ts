import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const user = getUserById(decoded.sub);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      created_at: user.created_at,
    },
  });
}
