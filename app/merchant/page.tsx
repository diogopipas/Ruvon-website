import { OrderDashboard } from "@/components/merchant/order-dashboard";
export const metadata = {
  title: "Loja · Ruvon",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <OrderDashboard />;
}
