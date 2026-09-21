import { NextResponse } from "next/server";
import { orderSchema } from "@/lib/validation";
import { parseRequest, apiError } from "@/lib/server/http";
import { saveOrder } from "@/lib/server/storage";
export async function POST(request: Request) {
  try {
    await saveOrder(await parseRequest(request, orderSchema, 120));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
