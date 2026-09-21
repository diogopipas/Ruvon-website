import { NextResponse } from "next/server";
import { eventSchema } from "@/lib/validation";
import { parseRequest, apiError } from "@/lib/server/http";
import { saveEvent } from "@/lib/server/storage";
export async function POST(request: Request) {
  try {
    const input = await parseRequest(request, eventSchema, 300);
    await saveEvent({ ...input, created_at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
