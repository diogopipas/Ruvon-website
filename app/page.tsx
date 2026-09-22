import Image from "next/image";
import { Suspense } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Clock3,
  MapPin,
  Snowflake,
  Zap,
} from "lucide-react";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { OrderLink } from "@/components/ui/order-link";
import {
  CategoryCards,
  CityPicker,
  LandingView,
  MerchantSection,
  PackCards,
} from "@/components/landing/landing-actions";
export default function Home() {
  return (
    <>
      <Header />
      <LandingView />
      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <span className="launch-badge">
              <span />
              A preparar o lançamento em Lisboa
              <ArrowUpRight size={14} />
            </span>
            <h1>
              Acabou <br />a bebida?
              <br />
              <span>Nós levamos.</span>
            </h1>
            <p className="hero-description">
              Cerveja gelada, gelo, mixers, snacks e tudo o que falta para
              salvar a noite.
            </p>
            <OrderLink
              source="hero"
              className="button button-primary hero-cta"
            />
            <p className="hero-microcopy">
              Monta a tua noite e ajuda-nos a escolher onde começar.
              <span>Ainda sem entregas. Sem pagamento.</span>
            </p>
          </div>
          <div className="hero-visual">
            <Image
              src="/images/jola-hero.webp"
              alt="Saco Jola cheio de bebidas geladas, gelo e snacks para a tua noite"
              width={1100}
              height={1100}
              preload
              sizes="(max-width: 700px) 100vw, 55vw"
            />
            <div className="time-sticker">
              <Clock3 size={22} />
              <div>
                <strong>~25 min</strong>
                <span>objetivo no lançamento</span>
              </div>
            </div>
            <div className="hero-note">
              <Snowflake size={16} />
              <span>
                Gelado. Rápido.
                <br />
                <b>Sem sair de casa.</b>
              </span>
            </div>
            <span className="visual-caption">
              A tua noite, bem acompanhada.
            </span>
          </div>
          <div className="hero-bottom">
            <span>
              <Snowflake size={16} />
              Bebidas no ponto.
            </span>
            <span>
              <Zap size={16} />
              Entrega rápida.*
            </span>
            <span>
              <MapPin size={16} />À tua porta.
            </span>
            <a href="#o-que-falta" aria-label="Descobrir categorias">
              <ArrowDown size={18} />
            </a>
          </div>
        </section>
        <div className="brand-strip" aria-hidden="true">
          <span>A NOITE NÃO ACABA AQUI.</span>
          <span>✳</span>
          <span>NÃO VÁS BUSCAR. PEDE.</span>
          <span>✳</span>
          <span>A NOITE NÃO ACABA AQUI.</span>
          <span>✳</span>
        </div>
        <section className="section container" id="o-que-falta">
          <div className="section-heading">
            <div>
              <h2>O que te falta?</h2>
              <p>O essencial para o «só mais uma».</p>
            </div>
            <OrderLink source="categories" className="text-link">
              Ver tudo
            </OrderLink>
          </div>
          <CategoryCards />
        </section>
        <section className="section packs-section container" id="packs">
          <div className="section-heading">
            <div>
              <span className="small-label">Os packs da noite</span>
              <h2>
                Não queres pensar?
                <br />
                Está tudo no saco.
              </h2>
            </div>
            <p className="section-aside">
              Compara o tamanho do grupo.
              <br />
              Escolhe uma vez. Está feito.
            </p>
          </div>
          <PackCards />
          <p className="preview-note">
            Uma antevisão das boas noites que aí vêm. Packs e preços
            ilustrativos.
          </p>
        </section>
        <section className="how-section" id="como-funciona">
          <div className="container">
            <div className="section-heading">
              <h2>
                Da tua lista
                <br />à tua porta.
              </h2>
              <p className="section-aside">
                É assim que queremos
                <br />
                salvar a tua noite.
              </p>
            </div>
            <div className="steps-grid">
              <article>
                <div className="step-illustration step-phone">
                  <span>1</span>
                  <div className="mini-phone">
                    <b>O que falta?</b>
                    <div>🍺 🧊 🥤</div>
                    <i>Pedir uma Jola ↗</i>
                  </div>
                </div>
                <h3>Diz-nos o que falta</h3>
                <p>
                  Cerveja? Gelo? Mixers? Snacks?
                  <br />
                  Escolhes, juntas e está feito.
                </p>
              </article>
              <article>
                <div className="step-illustration step-bag">
                  <span>2</span>
                  <div className="mini-bag">JOLA</div>
                  <Zap className="bag-zap" size={35} />
                </div>
                <h3>Nós tratamos disso</h3>
                <p>
                  Encontramos uma loja perto de ti.
                  <br />O teu pedido fica em boas mãos.
                </p>
              </article>
              <article>
                <div className="step-illustration step-cheers">
                  <span>3</span>
                  <div>🍻</div>
                  <i>+ uma boa noite</i>
                </div>
                <h3>A festa continua</h3>
                <p>
                  Recebes tudo sem ninguém ter de sair.
                  <br />O sofá agradece. O grupo também.
                </p>
              </article>
            </div>
            <p className="preview-note">
              * Objetivo de entrega no lançamento. Ainda não estamos a fazer
              entregas.
            </p>
          </div>
        </section>
        <section className="group-section container">
          <div className="group-copy">
            <span className="small-label">Todos temos este grupo.</span>
            <h2>
              Alguém tem
              <br />
              de ir buscar.
              <br />
              <span>Ou então, não.</span>
            </h2>
            <p>
              Feito para aquela mensagem no grupo.
              <br />E para ninguém ter de responder «eu vou».
            </p>
            <OrderLink source="group" />
          </div>
          <div className="chat-composition">
            <div className="chat-title">
              <span>🪩</span>
              <div>
                <strong>Só mais uma</strong>
                <small>tu e os amigos de sempre</small>
              </div>
              <span>···</span>
            </div>
            <div className="chat-message">
              <small>Miguel</small>
              <p>malta, acabou a cerveja 🫠</p>
              <time>23:47</time>
            </div>
            <div className="chat-message second">
              <small>Inês</small>
              <p>e o gelo também…</p>
              <time>23:47</time>
            </div>
            <div className="chat-message outgoing">
              <p>calma. peço uma Jola 🍺</p>
              <time>23:48 ✓✓</time>
            </div>
            <span className="chat-caption">
              Uma conversa imaginada. Uma situação demasiado real.
            </span>
          </div>
        </section>
        <section className="location-section">
          <div className="container">
            <span className="location-dot">
              <MapPin size={19} />A começar perto de ti.
            </span>
            <h2>Onde queres a Jola?</h2>
            <p>
              Estamos a preparar as primeiras entregas.
              <br />
              Diz-nos onde fazes a festa e fica com 5 € para a primeira Jola.
            </p>
            <CityPicker />
          </div>
        </section>
        <div className="container">
          <Suspense>
            <MerchantSection />
          </Suspense>
          <section className="faq-section" id="faq">
            <h2>
              Ainda tens sede <br />
              de respostas?
            </h2>
            <div className="faq-list">
              {[
                [
                  "Já posso fazer um pedido?",
                  "Ainda não. Estamos a validar a Jola antes do lançamento. Podes explorar o catálogo, montar um carrinho e dizer-nos a tua zona. Não há pagamentos, vendas ou entregas nesta fase.",
                ],
                [
                  "Onde vai chegar a Jola?",
                  "Queremos começar em Lisboa e crescer zona a zona. Deixa o teu código postal: a procura ajuda-nos a escolher as primeiras zonas.",
                ],
                [
                  "Como funciona a oferta de 5 €?",
                  "Ao deixares o teu contacto, ficas na lista para receber 5 € de desconto na primeira Jola, quando lançarmos na tua zona. As condições finais serão comunicadas antes de utilizares a oferta. Não é necessário pagar nada agora.",
                ],
                [
                  "É preciso ter mais de 18 anos?",
                  "Sim. A experiência Jola destina-se a maiores de 18 anos. O consumo responsável faz parte de uma boa noite.",
                ],
              ].map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span>+</span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
