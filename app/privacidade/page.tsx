import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { privacyConfig } from "@/lib/privacy";
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
          A Jola é um projeto em fase de validação. Esta página explica o que a
          experiência guarda e para quê.
        </p>
        <h2>Quem é responsável</h2>
        {ready ? (
          <p>
            O responsável pelo tratamento dos teus dados é {operator}. Podes
            contactar-nos em <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        ) : (
          <p>
            Esta política está em preparação. A identificação do responsável e o
            contacto de privacidade serão publicados antes da abertura das
            inscrições ao público.
          </p>
        )}
        <h2>O que guardamos</h2>
        <p>
          Se te inscreveres, guardamos o email ou telefone que escolheres, a
          cidade, o código postal, o carrinho simulado e a data do teu
          consentimento. Se representares uma loja, guardamos o nome da loja, a
          cidade, o teu nome e o contacto indicado.
        </p>
        <h2>Para que usamos os dados</h2>
        <p>
          Com o teu consentimento, usamos o teu contacto para comunicar o
          lançamento e a oferta da primeira Jola. A zona e os produtos
          escolhidos ajudam-nos a decidir onde lançar e o que disponibilizar. Os
          contactos das lojas são usados para preparar possíveis parcerias. Não
          pedimos dados de pagamento.
        </p>
        <h2>O que fica no teu dispositivo</h2>
        <p>
          Guardamos localmente a confirmação de idade, o carrinho, a zona e um
          identificador aleatório. O progresso e os rascunhos do formulário
          ficam apenas na sessão do separador. Também guardamos os parâmetros da
          campanha que te trouxe até aqui. Podes apagar estes dados nas
          definições do navegador.
        </p>
        <h2>Medição da experiência</h2>
        <p>
          Registamos visitas, cliques, produtos escolhidos e os passos do pedido
          para perceber a procura. Os eventos usam um identificador aleatório e
          não incluem o teu email ou telefone. Não está instalado nenhum pixel
          de publicidade ou fornecedor externo de analytics.
        </p>
        <h2>Armazenamento e acesso</h2>
        <p>
          Só a equipa responsável pelo projeto tem acesso aos contactos e aos
          pedidos simulados. Usamos fornecedores de alojamento e armazenamento
          para manter a experiência disponível. Não vendemos os teus dados.
        </p>
        <h2>Durante quanto tempo</h2>
        <p>
          A política prevista para esta fase é conservar os contactos e os dados
          associados durante um máximo de {retentionMonths} meses após a
          inscrição, ou até retirares o consentimento. Depois, serão eliminados
          ou anonimizados. Se o serviço lançar, qualquer nova utilização dos
          dados será explicada antes de acontecer.
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
            Para falar com a equipa Jola sobre os teus dados:{" "}
            <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        ) : (
          <p>
            O contacto para exercer estes direitos será publicado antes da
            abertura pública das inscrições.
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
