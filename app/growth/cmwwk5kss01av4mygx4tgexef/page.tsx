// Founder-reviewed marketing page. Verify the product flow before publishing.
import type { CSSProperties } from "react";

const conversionPath = "/checkout?interesse=1";
const campaignKeys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
type Query = Record<string, string | string[] | undefined>;

export default async function GrowthLandingPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const target = new URL(conversionPath, "https://cofounder.invalid");
  for (const key of campaignKeys) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 256) {
      target.searchParams.set(key, value);
    }
  }
  const destination = target.pathname + target.search + target.hash;
  return (
    <>
      <style>{"\n.cf-growth,.cf-growth *{box-sizing:border-box}\n.cf-growth{background:var(--cf-bg);color:var(--cf-ink);font:16px/1.65 var(--cf-body);min-height:100vh;padding:0 24px;overflow-wrap:anywhere;color-scheme:normal}\n.cf-growth .cf-wrap{max-width:1110px;margin:0 auto}\n.cf-growth .cf-brand{font:800 clamp(1.5rem,4vw,2.25rem)/1 var(--cf-display);letter-spacing:.04em;padding:28px 0;display:block;border-bottom:1px solid var(--cf-surface);color:var(--cf-accent)}\n.cf-growth .cf-hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:clamp(24px,5vw,72px);align-items:center;padding:clamp(48px,10vw,112px) 0}\n.cf-growth h1,.cf-growth h2,.cf-growth h3,.cf-growth p{margin:0;color:inherit}\n.cf-growth h1{font:800 clamp(2.7rem,7.6vw,6.5rem)/.99 var(--cf-display);letter-spacing:-.035em;max-width:14ch}\n.cf-growth h2{font:800 clamp(1.65rem,3.2vw,2.75rem)/1.06 var(--cf-display)}\n.cf-growth h3{font:800 1.35rem/1.2 var(--cf-display)}\n.cf-growth .cf-support{margin:22px 0;max-width:44ch;font-size:clamp(1.05rem,2vw,1.3rem)}\n.cf-growth .cf-cta{min-height:48px;display:inline-flex;align-items:center;justify-content:center;text-align:center;padding:12px 20px;background:var(--cf-accent);color:var(--cf-bg);font-weight:800;border-radius:8px;text-decoration:none}\n.cf-growth .cf-cta:focus-visible,.cf-growth summary:focus-visible{outline:3px solid var(--cf-accent);outline-offset:4px}\n.cf-growth .cf-feature{background:var(--cf-surface);border-top:4px solid var(--cf-accent);border-radius:12px;padding:clamp(20px,4vw,36px)}\n.cf-growth .cf-feature\u003ep+p{margin-top:16px}\n.cf-growth .cf-value{font-size:clamp(1.25rem,2.8vw,1.9rem);font-weight:800;line-height:1.3}\n.cf-growth .cf-benefits{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px;padding-bottom:48px}\n.cf-growth .cf-benefits article{border:1px solid var(--cf-surface);border-radius:10px;padding:22px}\n.cf-growth .cf-benefits p{margin-top:10px}\n.cf-growth .cf-section{border-top:1px solid var(--cf-surface);padding:32px 0 40px}\n.cf-growth ol{margin:14px 0 0;padding-inline-start:24px;list-style:decimal}\n.cf-growth li+li{margin-top:8px}\n.cf-growth details{border-bottom:1px solid var(--cf-surface);padding:12px 0}\n.cf-growth summary{cursor:pointer;padding-block:9px;font-weight:700}\n.cf-growth details p{padding-block:4px 12px}\n.cf-growth footer{border-top:1px solid var(--cf-surface);padding:28px 0 36px}\n@media(max-width:680px){.cf-growth .cf-hero{grid-template-columns:1fr}}\n"}</style>
      <main className={"cf-growth"} lang={"pt-PT"} style={{"--cf-bg":"#171815","--cf-ink":"#f4eedf","--cf-accent":"#efb735","--cf-surface":"#20211d","--cf-display":"var(--font-display, Impact), sans-serif","--cf-body":"var(--font-body, system-ui), sans-serif"} as CSSProperties}>
        <div className={"cf-wrap"}>
          <header className={"cf-brand"}>
            {"Ruvon"}
          </header>
          <section className={"cf-hero"} aria-labelledby={"cf-growth-title"}>
            <div>
              <h1 id={"cf-growth-title"}>
                {"Está a planear um convívio em casa? Explore packs de bebidas e artigos para a festa."}
              </h1>
              <p className={"cf-support"}>
                {"Na Ruvon, pode consultar o catálogo, ajustar um pack e deixar o seu contacto para mostrar interesse. Estamos a testar a ideia — ainda não fazemos vendas nem entregas."}
              </p>
              <a className={"cf-cta"} href={destination}>
                {"Registar interesse na ideia"}
              </a>
            </div>
            <div className={"cf-feature"}>
              <p>
                {"Preparar um convívio pode implicar procurar bebidas e artigos para a festa em vários sítios. Estamos a testar se consultar e configurar um pack num só catálogo lhe seria útil; ainda não temos evidência direta de que esta seja uma necessidade generalizada."}
              </p>
              <p className={"cf-value"}>
                {"Explore uma versão de teste da Ruvon: veja produtos e packs, ajuste opções e registe o seu interesse. O registo ajuda-nos a perceber se vale a pena desenvolver o conceito para pessoas que organizam convívios em casa."}
              </p>
            </div>
          </section>
          <div className={"cf-benefits"}>
            <article>
              <h2>
                {"Explore o catálogo ao seu ritmo"}
              </h2>
              <p>
                {"Consulte packs e produtos individuais, e use a pesquisa, categorias e filtros para navegar pela seleção disponível na experiência de teste."}
              </p>
            </article>
            <article>
              <h2>
                {"Ajuste um pack às suas preferências"}
              </h2>
              <p>
                {"Configure as opções do pack e veja o preço apresentado atualizar-se. Trata-se de uma simulação; não pode concluir uma compra."}
              </p>
            </article>
            <article>
              <h2>
                {"Indique que tem interesse"}
              </h2>
              <p>
                {"Pode registar o seu contacto e a sua cidade através do fluxo de interesse. Estes dados ficam associados ao seu interesse e ao cesto simulado."}
              </p>
            </article>
          </div>
          <section className={"cf-section"}>
            <h2>
              {"Como funciona"}
            </h2>
            <ol>
              <li>
                {"Confirme que tem idade legal para aceder ao catálogo."}
              </li>
              <li>
                {"Explore os produtos e packs e configure as opções que lhe interessam."}
              </li>
              <li>
                {"Se quiser ajudar-nos a avaliar a ideia, registe o seu contacto e a sua cidade."}
              </li>
            </ol>
          </section>
          <section className={"cf-section"}>
            <h2>
              {"Perguntas frequentes"}
            </h2>
            <details>
              <summary>
                {"Posso comprar ou receber uma encomenda através da Ruvon?"}
              </summary>
              <p>
                {"Não. A Ruvon está numa fase de validação da procura: o catálogo e o cesto são simulados e não há vendas, pagamentos ou entregas."}
              </p>
            </details>
            <details>
              <summary>
                {"O que acontece depois de registar o meu interesse?"}
              </summary>
              <p>
                {"O seu contacto e a sua cidade ficam registados como sinal de interesse, juntamente com o cesto simulado. O registo não é uma encomenda nem uma reserva. Nesta fase, não podemos prometer um lançamento ou um contacto posterior."}
              </p>
            </details>
            <details>
              <summary>
                {"O preço apresentado é final?"}
              </summary>
              <p>
                {"Não. Os preços e as alterações ao configurar um pack fazem parte da experiência de teste e não correspondem a uma oferta de compra."}
              </p>
            </details>
            <details>
              <summary>
                {"Porque é pedida confirmação de idade?"}
              </summary>
              <p>
                {"A confirmação de idade é necessária antes de aceder ao catálogo."}
              </p>
            </details>
          </section>
          <footer>
            <a className={"cf-cta"} href={destination}>
              {"Registar interesse na ideia"}
            </a>
          </footer>
        </div>
      </main>
    </>
  );
}
