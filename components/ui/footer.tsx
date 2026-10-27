import Link from "next/link";
import { Wordmark } from "./wordmark";
export function Footer({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <footer className="store-footer">
        <div className="container">
          <span>© {new Date().getFullYear()} Ruvon</span>
          <nav aria-label="Rodapé">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
        </div>
      </footer>
    );
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <Wordmark />
            <p>Pede uma Ruvon</p>
          </div>
          <nav aria-label="Rodapé">
            <Link href="/#ajuda">Como funciona</Link>
            <Link href="/?loja=1#lojas">Lojas</Link>
            <Link href="/pedir?categoria=todos">Produtos</Link>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Ruvon. Feito para boas noites.
          </span>
        </div>
      </div>
    </footer>
  );
}
