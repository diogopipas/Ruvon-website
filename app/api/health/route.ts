import { orderRepository } from "@/lib/server/orders/repository";
export async function GET() {
  try {
    const { data, error } = await orderRepository()
      .db.from("worker_health")
      .select("last_success_at")
      .eq("name", "orders")
      .maybeSingle();
    const healthy =
      !error &&
      data?.last_success_at &&
      Date.now() - Date.parse(data.last_success_at) < 120000;
    return Response.json(
      { ok: !!healthy },
      { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
