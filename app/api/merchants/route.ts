import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { merchantSchema } from "@/lib/validation";
import { parseRequest, apiError } from "@/lib/server/http";
import { saveMerchant } from "@/lib/server/storage";
export async function POST(request: Request) {
  try {
    const { consent, website, submission_id, ...input } = await parseRequest(
      request,
      merchantSchema,
      8,
    );
    void consent;
    void website;
    await saveMerchant({
      ...input,
      id: submission_id ?? randomUUID(),
      created_at: new Date().toISOString(),
      consent_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(
      error,
      "Não conseguimos guardar o interesse da tua loja. Tenta novamente.",
    );
  }
}
