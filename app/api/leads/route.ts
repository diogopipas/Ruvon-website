import { NextResponse } from "next/server";
import { leadSchema } from "@/lib/validation";
import { parseRequest, apiError } from "@/lib/server/http";
import { saveLead } from "@/lib/server/storage";
export async function POST(request: Request) {
  try {
    await saveLead(await parseRequest(request, leadSchema, 12));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
