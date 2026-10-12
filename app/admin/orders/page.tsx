import { OrderOperations } from "@/components/admin/order-operations";
export const metadata = {
  title: "Operações",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <OrderOperations />;
}
