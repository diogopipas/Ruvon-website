import { Wordmark } from "./wordmark";
import { OrderLink } from "./order-link";
import Link from "next/link";
export function Header() {
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Wordmark />
        <nav aria-label="Navegação principal">
          <Link href="/#como-funciona" className="nav-link">
            Como funciona
          </Link>
          <Link href="/?loja=1#lojas" className="nav-link">
            Quero vender na Jola
          </Link>
          <OrderLink
            source="navbar"
            className="button button-primary button-small"
          >
            Pedir uma Jola
          </OrderLink>
        </nav>
      </div>
    </header>
  );
}
