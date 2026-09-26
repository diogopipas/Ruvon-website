import Link from "next/link";
import { Wordmark } from "./wordmark";
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <Wordmark />
            <p>Pede uma Jola</p>
          </div>
          <nav aria-label="Rodapé">
            <Link href="/#como-funciona">Como funciona</Link>
            <Link href="/#lojas">Lojas</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Jola. Feito para boas noites.
          </span>
        </div>
      </div>
    </footer>
  );
}
