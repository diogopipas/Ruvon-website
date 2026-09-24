import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ArrowUpRight,
  BarChart3,
  MapPin,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Wordmark } from "@/components/ui/wordmark";
import { AdminActions, AdminLogin } from "@/components/admin/admin-actions";
import { adminConfigured, isAdmin } from "@/lib/server/auth";
import { isLocalStorage } from "@/lib/server/supabase";
import { readDatabase } from "@/lib/server/storage";
import { summarize } from "@/lib/dashboard";
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
export default async function Admin() {
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
            <Dashboard />
          </Suspense>
        ) : (
          <AdminLogin configured={adminConfigured()} />
        )}
      </main>
    </>
  );
}
async function Dashboard() {
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
  const stats = summarize(db);
  const demand = summarizePacks(db);
  const local = isLocalStorage();
  return (
    <>
      <div className="dashboard-intro">
        <div>
          <span className="small-label">Antes da primeira entrega.</span>
          <h1>Há sede de Jola?</h1>
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
            label: "Ainda sem checkout",
            value: stats.beforeCheckout,
            detail: "Carrinhos que ainda não avançaram",
            icon: ShoppingBag,
          },
          {
            label: "Checkout sem contacto",
            value: stats.withoutContact,
            detail: "Chegaram ao checkout, sem inscrição",
            icon: Users,
          },
          {
            label: "Contactos recebidos",
            value: stats.leads,
            detail: "Inclui inscrições por cidade",
            icon: Users,
          },
          {
            label: "Volume simulado",
            value: money(stats.gmv),
            detail: "Carrinhos atuais, incluindo taxas",
            icon: BarChart3,
          },
          {
            label: "Valor médio do carrinho",
            value: money(stats.average),
            detail: "Carrinhos não vazios, sem taxas",
            icon: ShoppingBag,
          },
          {
            label: "Pedido → contacto",
            value: `${stats.conversion.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`,
            detail: "Pedidos convertidos / iniciados",
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
          <p>
            Perfis de navegador observados, incluindo entradas diretas no
            catálogo. Valores de carrinhos simulados, sem taxas.
          </p>
          <div className="pack-kpis">
            {[
              [
                "Viram packs",
                `${demand.viewRate.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`,
                `${demand.viewed} de ${demand.profiles} perfis`,
              ],
              [
                "Adicionaram um pack",
                `${demand.addRate.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`,
                `${demand.added} ${demand.added === 1 ? "perfil" : "perfis"}`,
              ],
              [
                "Checkouts com pack",
                `${demand.checkoutShare.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`,
                "Pelo menos um pack no carrinho",
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
                </tr>
              </thead>
              <tbody>
                {demand.packs.map((pack) => (
                  <tr key={pack.id}>
                    <td>{pack.name}</td>
                    <td>{pack.units}</td>
                    <td>{pack.checkouts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <section className="dashboard-panel">
          <h2>
            <MapPin size={20} />
            Onde faz sentido chegar
          </h2>
          <p>Sessões únicas por cidade e código postal.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>Procura</th>
                  <th>Contactos</th>
                </tr>
              </thead>
              <tbody>
                {stats.locations.map((row) => (
                  <tr key={`${row.city}${row.postcode}`}>
                    <td>
                      {row.city}
                      <small>{row.postcode}</small>
                    </td>
                    <td>{row.demand}</td>
                    <td>{row.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stats.locations.length && (
              <p className="dashboard-empty">
                As primeiras zonas aparecem aqui.
              </p>
            )}
          </div>
        </section>
        <section className="dashboard-panel">
          <h2>Da curiosidade à primeira Jola</h2>
          <p>
            Uma contagem por dispositivo que iniciou um pedido. Inclui entradas
            diretas no catálogo.
          </p>
          <Bars
            data={[
              { name: "Pedidos iniciados", value: stats.started },
              { name: "Chegaram ao checkout", value: stats.checkout },
              {
                name: "Pedidos convertidos",
                value: stats.converted,
              },
            ]}
          />
          <p>
            {stats.checkout
              ? `${stats.checkoutConversion.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}% dos que chegaram ao checkout deixaram contacto.`
              : "A conversão aparece quando alguém chega ao checkout."}{" "}
            Inscrições só por cidade ficam fora deste funil.
          </p>
        </section>
        <section className="dashboard-panel full-width">
          <h2>De onde vêm as boas noites</h2>
          <p>
            Última campanha guardada em cada pedido. Só conta como conversão
            quando o contacto tem a mesma campanha, origem e meio. Inscrições só
            por cidade contam apenas em contactos.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Origem / meio</th>
                  <th>Pedidos</th>
                  <th>Checkout</th>
                  <th>Contactos</th>
                  <th>Pedido → contacto</th>
                  <th>Volume simulado</th>
                </tr>
              </thead>
              <tbody>
                {stats.campaigns.map((row) => (
                  <tr key={JSON.stringify([row.name, row.source, row.medium])}>
                    <td>{row.name}</td>
                    <td>
                      {row.source}
                      <small>{row.medium}</small>
                    </td>
                    <td>{row.orders}</td>
                    <td>{row.checkout}</td>
                    <td>{row.leads}</td>
                    <td>
                      {row.orders
                        ? `${row.conversion.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`
                        : "—"}
                    </td>
                    <td>{money(row.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stats.campaigns.length && (
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
                      <td>
                        {lead.city}
                        <small>{lead.postcode}</small>
                      </td>
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
        Dados desde o início da validação. Sem testemunhos, vendas ou números
        inventados. Um identificador por dispositivo, até limpar os dados do
        navegador; não equivale a pessoas únicas. {stats.visitors} dispositivos
        passaram pela página inicial. Os valores representam intenção, não
        receita.
      </p>
    </>
  );
}
