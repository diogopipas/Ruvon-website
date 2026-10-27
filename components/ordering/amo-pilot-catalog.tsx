import Image from "next/image";
import { money } from "@/lib/pricing";

export type AmoPilotProduct = {
  id: string;
  name: string;
  unit: string;
  price_cents: number;
};

/** Receives only public presentation fields, never the operational draft. */
export function AmoPilotCatalog({ products }: { products: AmoPilotProduct[] }) {
  const packPrice = products.reduce(
    (total, product) => total + product.price_cents,
    0,
  );

  return (
    <section className="amo-pilot" id="amo" aria-label="Pack A.M.O.">
      <article
        className="pack-product amo-pack"
        aria-labelledby="amo-pack-title"
      >
        <div className="amo-pack-stage">
          <Image
            className="amo-pack-wordmark"
            src="/images/amo/amo-logo.png"
            alt="A.M.O. brewery"
            width={4000}
            height={2333}
            sizes="(max-width: 700px) 180px, 220px"
          />
          <div
            className="amo-pack-bottles"
            aria-label="As três cervejas do pack"
          >
            <Image
              className="amo-bottle amo-bottle-ipa"
              src="/images/amo/most-wanted.png"
              alt="Most wanted IPA"
              width={420}
              height={661}
              sizes="(max-width: 700px) 42vw, 220px"
            />
            <Image
              className="amo-bottle amo-bottle-apa"
              src="/images/amo/borboletas.png"
              alt="Borboletas APA"
              width={420}
              height={661}
              sizes="(max-width: 700px) 42vw, 220px"
            />
            <Image
              className="amo-bottle amo-bottle-amber"
              src="/images/amo/alley-cat.png"
              alt="Alley Cat Amber"
              width={420}
              height={661}
              sizes="(max-width: 700px) 42vw, 220px"
            />
          </div>
          <p className="amo-pack-stage-note">De Lisboa, com A.M.O.</p>
        </div>
        <div className="pack-receipt amo-pack-receipt">
          <span className="pack-audience">
            3 cervejas artesanais · 3 × 33 cl
          </span>
          <h3 id="amo-pack-title">Pack de descoberta</h3>
          <p className="amo-pack-intro">
            Três estilos, uma cervejeira. Descobre a A.M.O. com uma garrafa de
            cada.
          </p>
          <ul className="amo-pack-contents" aria-label="O que inclui o pack">
            {products.map((product) => (
              <li key={product.id}>
                <span className="amo-pack-quantity">1 ×</span>
                <span>{product.name}</span>
                <small>33 cl</small>
              </li>
            ))}
          </ul>
          <div className="pack-buy amo-pack-buy">
            <div>
              <small className="pack-price-label">O pack completo</small>
              <strong>{money(packPrice)}</strong>
            </div>
            <button className="button amo-pack-cta" disabled>
              Indisponível
            </button>
          </div>
          <p className="amo-pack-availability">IVA incluído.</p>
        </div>
      </article>
      <details className="amo-brewery-story">
        <summary>Sobre a A.M.O.</summary>
        <p>
          A A.M.O. é uma nano-cervejeira no coração de Lisboa, fundada em 2016
          por Margaret Orlowski. Nasceu da vontade de fazer cerveja e de a
          partilhar com amigos. Hoje, mantém esse espírito em pequenos lotes
          artesanais, com diferentes estilos e um taproom onde as boas conversas
          fazem parte da casa.
        </p>
      </details>
    </section>
  );
}
