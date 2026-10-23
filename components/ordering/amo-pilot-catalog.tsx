import "server-only";
import Link from "next/link";
import draft from "@/docs/pilot/amo-draft.json";
import { money } from "@/lib/pricing";

/** Presentation only. The private operational draft never enters the client bundle. */
export function AmoPilotCatalog({ home = false }: { home?: boolean }) {
  return (
    <section className="amo-pilot" id="amo" aria-labelledby="amo-heading">
      <div className="amo-pilot-heading">
        <div>
          <h2 id="amo-heading">Cervejas artesanais da A.M.O.</h2>
          <p>
            Três cervejas para o nosso piloto em Lisboa, ainda em preparação.
          </p>
        </div>
        <span className="amo-pilot-status">Em breve</span>
      </div>
      <ul className="amo-pilot-products" aria-label="Cervejas do piloto A.M.O.">
        {draft.products.map((product) => (
          <li key={product.ruvon_sku}>
            <h3>{product.name}</h3>
            <div className="amo-pilot-product-price">
              <span>{product.unit}</span>
              <strong>{money(product.price_cents)}</strong>
            </div>
          </li>
        ))}
      </ul>
      <div className="amo-pilot-footer">
        <p>
          Preços por garrafa, com IVA incluído.
          <strong> Encomendas ainda indisponíveis.</strong>
        </p>
        {home && (
          <Link href="/pedir#amo" className="amo-pilot-link">
            Ver no catálogo
          </Link>
        )}
      </div>
    </section>
  );
}
