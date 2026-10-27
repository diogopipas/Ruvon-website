import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { privacyConfig } from "@/lib/privacy";
import { MetaPixelPreferencesButton } from "@/components/analytics/meta-pixel";
export const metadata: Metadata = { title: "Privacidade" };
export default function Privacy() {
  const { operator, contact, retentionMonths, ready } = privacyConfig();
  return (
    <>
      <Header />
      <main id="main" className="container legal-page">
        <Link className="back-link" href="/">
          Voltar ao início
        </Link>
        <h1>A tua privacidade.</h1>
        <p>
          Esta página explica que dados a Ruvon guarda e para que os utiliza.
        </p>
        <h2>Quem é responsável</h2>
        {ready ? (
          <p>
            O responsável pelo tratamento dos teus dados é {operator}. Podes
            contactar-nos em <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        ) : (
          <p>
            O responsável pelo tratamento e o contacto de privacidade não estão
            identificados nesta página.
          </p>
        )}
        <h2>O que guardamos</h2>
        <p>
          Se te inscreveres, guardamos o email ou telefone que escolheres, a
          cidade, o carrinho selecionado e a data do teu consentimento. Se
          representares uma loja, guardamos o nome da loja, a cidade, o teu nome
          e o contacto indicado.
        </p>
        <h2>Para que usamos os dados</h2>
        <p>
          Com o teu consentimento, usamos o teu contacto para comunicar a
          disponibilidade da Ruvon na tua zona. A zona e os produtos escolhidos
          ajudam-nos a perceber a procura e o que disponibilizar. Os contactos
          das lojas são usados para falar sobre possíveis parcerias. Não pedimos
          dados de pagamento neste formulário.
        </p>
        <h2>O que fica no teu dispositivo</h2>
        <p>
          Guardamos localmente a confirmação de idade, o carrinho, a zona e um
          identificador aleatório. O progresso e os rascunhos do formulário
          ficam apenas na sessão do separador. Também guardamos os parâmetros da
          campanha que te trouxe até aqui e a tua escolha sobre publicidade.
          Podes apagar estes dados nas definições do navegador.
        </p>
        <h2>Medição da experiência</h2>
        <p>
          Registamos visitas, cliques, produtos escolhidos e os passos do pedido
          para perceber a procura. Os eventos usam um identificador aleatório e
          não incluem o teu email ou telefone. A Vercel Web Analytics também
          mede visitas e páginas vistas de forma agregada, sem cookies de
          rastreamento. Não lhe enviamos dados de contacto.
        </p>
        <p>
          Se autorizares a medição de publicidade, o Meta Pixel (Meta Platforms)
          recebe eventos de página vista, incluindo o endereço da página e dados
          técnicos do navegador. Pode usar identificadores e cookies para medir
          campanhas. Não lhe enviamos os dados dos formulários. Sem a tua
          autorização, o Pixel não é carregado. Podes recusar e alterar a tua
          escolha a qualquer momento.
        </p>
        <MetaPixelPreferencesButton />
        <h2>Armazenamento e acesso</h2>
        <p>
          Só a equipa responsável pelo projeto tem acesso aos contactos e aos
          registos de interesse. Usamos fornecedores de alojamento e
          armazenamento para manter a experiência disponível. Não vendemos os
          teus dados.
        </p>
        <h2>Durante quanto tempo</h2>
        <p>
          A política de conservação define um máximo de {retentionMonths} meses
          após a inscrição para os contactos e os dados associados, ou até
          retirares o consentimento. Depois, serão eliminados ou anonimizados.
          Qualquer nova utilização dos dados será explicada antes de acontecer.
        </p>
        <h2>As tuas escolhas</h2>
        <p>
          Podes retirar o consentimento e pedir a consulta, correção ou
          eliminação dos teus dados, bem como a limitação e a portabilidade,
          quando aplicáveis. Retirar o consentimento não afeta o tratamento
          realizado até esse momento. Apagar o armazenamento do navegador não
          elimina os dados já enviados ao servidor.
        </p>
        {contact ? (
          <p>
            Para falar com a equipa Ruvon sobre os teus dados:{" "}
            <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        ) : (
          <p>
            O contacto para exercer estes direitos não está indicado nesta
            página.
          </p>
        )}
        <h2>Se precisares de ajuda</h2>
        <p>
          Podes apresentar uma reclamação à{" "}
          <a href="https://www.cnpd.pt/">
            Comissão Nacional de Proteção de Dados
          </a>
          . A inscrição é opcional. Não tomamos decisões automatizadas com
          efeitos jurídicos sobre ti.
        </p>
      </main>
      <Footer />
    </>
  );
}
