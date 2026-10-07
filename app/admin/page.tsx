import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, BarChart3, ShoppingBag, Users } from "lucide-react";
import { Wordmark } from "@/components/ui/wordmark";
import { AdminActions, AdminLogin } from "@/components/admin/admin-actions";
import { adminConfigured, isAdmin } from "@/lib/server/auth";
import { isLocalStorage } from "@/lib/server/supabase";
import { readDatabase } from "@/lib/server/storage";
import {
  filterDashboardCity,
  summarize,
  type DashboardCity,
} from "@/lib/dashboard";
import { summarizePacks } from "@/lib/pack-demand";
import { money } from "@/lib/pricing";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Painel de procura",
  robots: { index: false, follow: false },
};
function Bars({
  data,
  empty = "Ainda não há seleções.",
}: {
  data: { name: string; value: number }[];
  empty?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return data.length ? (
    <div className="bar-chart">
      {data.map((row) => (
        <div key={row.name}>
          <div>
            <span>{row.name}</span>
            <strong>{row.value}</strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="dashboard-empty">{empty}</p>
  );
}
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ cidade?: string | string[] }>;
}) {
  const requestedCity = (await searchParams).cidade;
  const city: DashboardCity =
    requestedCity === "faro"
      ? "Faro"
      : requestedCity === "lisboa"
        ? "Lisboa"
        : "all";
  const authorized = await isAdmin();
  return (
    <>
      <header className="admin-header container">
        <div>
          <Wordmark />
          <span>Nos bastidores</span>
        </div>
        {authorized && <AdminActions />}
      </header>
      <main id="main" className="container admin-main">
        {authorized ? (
          <Suspense
            fallback={
              <p className="dashboard-empty" role="status">
                A carregar a procura…
              </p>
            }
          >
            <Dashboard city={city} />
          </Suspense>
        ) : (
          <AdminLogin configured={adminConfigured()} />
        )}
      </main>
    </>
  );
}
async function Dashboard({ city }: { city: DashboardCity }) {
  let db;
  try {
    db = await readDatabase();
  } catch {
    return (
      <div className="admin-login">
        <h1>Os dados não chegaram.</h1>
        <p>
          Não conseguimos carregar os dados. Tenta atualizar. Se continuar,
          confirma a ligação ao Supabase e as migrações SQL.
        </p>
      </div>
    );
  }
  db = filterDashboardCity(db, city);
  const stats = summarize(db);
  const demand = summarizePacks(db);
  const percentage = (value: number) =>
    `${value.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;
  const local = isLocalStorage();
  return (
    <>
      <div className="dashboard-intro">
        <div>
          <span className="small-label">Antes da primeira entrega.</span>
          <h1>Há sede de Ruvon?</h1>
          <p>Procura real. Pedidos simulados. Próximas decisões.</p>
        </div>
        <span className={`data-badge ${local ? "local" : ""}`}>
          <span />
          {local ? "Dados locais de demonstração" : "Ligado ao Supabase"}
        </span>
      </div>
      {local && (
        <p className="admin-notice">
          Os dados deste painel estão guardados neste computador. Liga o
          Supabase antes de partilhares o site ou investires em anúncios.
        </p>
      )}
      <nav
        className="dashboard-city-filter"
        aria-label="Filtrar painel por cidade"
      >
        {(
          [
            ["all", "Todas", "/admin"],
            ["Faro", "Faro", "/admin?cidade=faro"],
            ["Lisboa", "Lisboa", "/admin?cidade=lisboa"],
          ] as const
        ).map(([value, label, href]) => (
          <Link
            key={value}
            href={href}
            aria-current={city === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="metric-grid">
        {[
          {
            label: "Pedidos iniciados",
            value: stats.started,
            detail: "Sessões que adicionaram artigos",
            icon: ShoppingBag,
          },
          {
            label: "Chegaram ao checkout",
            value: stats.checkout,
            detail: "Pedidos com intenção de continuar",
            icon: ArrowUpRight,
          },
          {
            label: "Contactos recebidos",
            value: stats.leads,
            detail: "Inclui inscrições por cidade",
            icon: Users,
          },
          {
            label: "Valor médio do carrinho",
            value: money(stats.average),
            detail: "Carrinhos não vazios, sem taxas",
            icon: ShoppingBag,
          },
          {
            label: "Volume simulado",
            value: money(stats.gmv),
            detail: "Carrinhos atuais, incluindo taxas",
            icon: BarChart3,
          },
          {
            label: "Pedido → Checkout %",
            value: percentage(stats.orderToCheckout),
            detail: "Checkouts / pedidos iniciados",
            icon: ArrowUpRight,
          },
          {
            label: "Checkout → Contacto %",
            value: percentage(stats.checkoutConversion),
            detail: "Contactos de pedidos / checkouts",
            icon: ArrowUpRight,
          },
        ].map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div>
              <span>{metric.label}</span>
              <metric.icon size={16} />
            </div>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-panel full-width">
          <h2>Os packs estão a resolver a noite?</h2>
          <p>Packs nos carrinhos guardados. Valores simulados, sem taxas.</p>
          <div className="pack-kpis">
            {[
              [
                "Carrinhos com pack",
                percentage(demand.cartShare),
                "Pelo menos um pack no carrinho",
              ],
              [
                "Pack mais escolhido",
                demand.packs[0]?.units ? demand.packs[0].name : "—",
                `${demand.packs[0]?.units ?? 0} unidades nos carrinhos`,
              ],
              [
                "Carrinho médio com pack",
                money(demand.packAov),
                "Subtotal, inclui extras",
              ],
              [
                "Carrinho médio sem pack",
                money(demand.nonPackAov),
                "Subtotal de artigos avulsos",
              ],
            ].map(([label, value, detail]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pack</th>
                  <th>Unidades nos carrinhos</th>
                  <th>Chegaram ao checkout</th>
                  <th>Taxa de checkout</th>
                </tr>
              </thead>
              <tbody>
                {demand.packs.map((pack) => (
                  <tr key={pack.id}>
                    <td>{pack.name}</td>
                    <td>{pack.units}</td>
                    <td>{pack.checkouts}</td>
                    <td>{pack.carts ? percentage(pack.checkoutRate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="dashboard-panel">
          <h2>Extras mais removidos</h2>
          <p>Unidades retiradas das configurações guardadas.</p>
          <Bars data={demand.removedExtras} />
        </section>
        <section className="dashboard-panel">
          <h2>Extras mais escolhidos</h2>
          <p>Unidades mantidas ou escolhidas nos packs guardados.</p>
          <Bars data={demand.selectedExtras} />
        </section>
        <section className="dashboard-panel full-width">
          <h2>Trocas de marcas e produtos</h2>
          <p>Escolhas finais diferentes das opções default do pack.</p>
          <Bars data={demand.swaps} />
        </section>
        <section className="dashboard-panel">
          <h2>Quantos são?</h2>
          <p>Última escolha de tamanho por perfil de navegador.</p>
          <Bars data={demand.groups} />
        </section>
        <section className="dashboard-panel">
          <h2>O que faltou depois do pack?</h2>
          <p>
            Adições de artigos avulsos com um pack já no carrinho. Não desconta
            remoções.
          </p>
          <Bars data={demand.addons} />
        </section>
        <section className="dashboard-panel">
          <h2>Os favoritos da noite</h2>
          <p>Unidades nos carrinhos atuais. Remoções já descontadas.</p>
          <Bars
            data={stats.products}
            empty="Os primeiros carrinhos mostram o que faz falta."
          />
        </section>
        <section className="dashboard-panel">
          <h2>O que anda a faltar</h2>
          <p>Unidades nos carrinhos atuais, por categoria. Packs à parte.</p>
          <Bars data={stats.categories} />
        </section>
        <section className="dashboard-panel full-width">
          <h2>Campanhas / Cidades</h2>
          <p>
            Intenção por campanha, conteúdo e cidade. Cada pedido e contacto
            conta na atribuição que ficou guardada; AOV sem taxas.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>utm_campaign</th>
                  <th>utm_content</th>
                  <th>Origem</th>
                  <th>Cidade</th>
                  <th>Pedidos iniciados</th>
                  <th>Checkouts</th>
                  <th>Contactos</th>
                  <th>AOV</th>
                  <th>GMV simulado</th>
                </tr>
              </thead>
              <tbody>
                {stats.campaignCities.map((row) => (
                  <tr
                    key={JSON.stringify([
                      row.campaign,
                      row.content,
                      row.source,
                      row.city,
                    ])}
                  >
                    <td>{row.campaign}</td>
                    <td>{row.content}</td>
                    <td>{row.source}</td>
                    <td>{row.city}</td>
                    <td>{row.started}</td>
                    <td>{row.checkouts}</td>
                    <td>{row.contacts}</td>
                    <td>{row.aov ? money(row.aov) : "—"}</td>
                    <td>{money(row.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stats.campaignCities.length && (
              <p className="dashboard-empty">
                As campanhas aparecem quando chegam os primeiros pedidos.
              </p>
            )}
          </div>
        </section>
        <section className="dashboard-panel full-width">
          <h2>Os primeiros da lista</h2>
          <p>As 20 inscrições mais recentes.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Zona</th>
                  <th>Carrinho</th>
                  <th>Campanha / conteúdo</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {[...db.leads]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .slice(0, 20)
                  .map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.email || lead.phone}</td>
                      <td>{lead.city}</td>
                      <td>{money(lead.basket_total)}</td>
                      <td>
                        {lead.utm_campaign || "Direto"}
                        <small>{lead.utm_content || "—"}</small>
                      </td>
                      <td>
                        {new Date(lead.created_at).toLocaleDateString("pt-PT", {
                          timeZone: "Europe/Lisbon",
                        })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!db.leads.length && (
              <p className="dashboard-empty">
                Ainda não há contactos. Está tudo pronto para o primeiro.
              </p>
            )}
          </div>
        </section>
        <section className="dashboard-panel full-width">
          <h2>Lojas que querem juntar-se</h2>
          <p>{db.merchant_interests.length} manifestações de interesse.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Cidade</th>
                  <th>Pessoa de contacto</th>
                  <th>Email / telefone</th>
                </tr>
              </thead>
              <tbody>
                {[...db.merchant_interests]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .slice(0, 20)
                  .map((store) => (
                    <tr key={store.id}>
                      <td>{store.store_name}</td>
                      <td>{store.city}</td>
                      <td>{store.contact_name}</td>
                      <td>{store.contact}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!db.merchant_interests.length && (
              <p className="dashboard-empty">
                O próximo parceiro pode estar ao virar da esquina.
              </p>
            )}
          </div>
        </section>
      </div>
      <p className="dashboard-footnote">
        Dados desde o início da validação. Cada pedido representa o estado atual
        de um carrinho por navegador. Valores simulados representam intenção,
        não receita. Inscrições apenas por cidade contam em contactos, fora do
        funil de pedidos.
      </p>
    </>
  );
}
