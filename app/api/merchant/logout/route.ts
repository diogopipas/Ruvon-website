import { logoutStaff } from "@/lib/server/merchant/auth";
import { requirePaymentOrigin } from "@/lib/server/payment-http";
import { apiError } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    requirePaymentOrigin(request);
    await logoutStaff();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
