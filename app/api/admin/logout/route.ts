import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRequest, apiError } from "@/lib/server/http";
import { ADMIN_COOKIE } from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    await parseRequest(request, z.object({}));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "strict",
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
