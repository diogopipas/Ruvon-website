import Link from "next/link";
import { Header } from "@/components/ui/header";
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="error-page">
        <span className="small-label">404 · Fora da festa</span>
        <h1>Aqui já não há nada.</h1>
        <p>Mas o essencial para a noite está logo ali.</p>
        <Link href="/pedir" className="button button-primary">
          Voltar à Ruvon
        </Link>
      </main>
    </>
  );
}
