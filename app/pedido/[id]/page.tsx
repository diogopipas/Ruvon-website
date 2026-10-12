import { notFound } from "next/navigation";
import { z } from "zod";
import { OrderStatus } from "@/components/orders/order-status";
import { commerceEnvironment } from "@/lib/server/commerce-config";
export const metadata = {
  title: "O teu pedido",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  let environment: "sandbox" | "live";
  try {
    environment = commerceEnvironment();
  } catch {
    notFound();
  }
  return <OrderStatus id={id.data} environment={environment} />;
}
