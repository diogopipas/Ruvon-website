import { OrderOperations } from "@/components/admin/order-operations";
import { z } from "zod";
import { notFound } from "next/navigation";
export const metadata = {
  title: "Operações · Pedido",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <OrderOperations id={id.data} />;
}
