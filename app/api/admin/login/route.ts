import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRequest, apiError, RequestError } from "@/lib/server/http";
import {
  adminConfigured,
  passwordMatches,
  createAdminToken,
  ADMIN_COOKIE,
  SESSION_SECONDS,
} from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    const { password } = await parseRequest(
      request,
      z.object({ password: z.string().max(256) }),
      5,
    );
    if (!adminConfigured())
      throw new RequestError(
        "Define ADMIN_PASSWORD com pelo menos 12 caracteres.",
        503,
      );
    if (!passwordMatches(password))
      throw new RequestError("Palavra-passe incorreta.", 401);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createAdminToken(), {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return apiError(error, "Não foi possível entrar. Tenta novamente.");
  }
}
