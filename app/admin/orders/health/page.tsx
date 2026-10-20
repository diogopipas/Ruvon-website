import { OperationsHealth } from "@/components/admin/operations-monitor";

export const metadata = {
  title: "Operações · Saúde e falhas",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <OperationsHealth />;
}
