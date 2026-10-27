import { Wordmark } from "./wordmark";
import { OrderLink } from "./order-link";
import Link from "next/link";
export function Header() {
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Wordmark />
        <nav aria-label="Navegação principal">
          <Link href="/pedir?categoria=todos" className="nav-link">
            Produtos
          </Link>
          <Link href="/?loja=1#lojas" className="nav-link">
            Quero vender na Ruvon
          </Link>
          <OrderLink
            source="navbar"
            className="button button-primary button-small"
          >
            Pedir uma Ruvon
          </OrderLink>
        </nav>
      </div>
    </header>
  );
}
