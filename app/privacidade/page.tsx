import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
export const metadata: Metadata = { title: "Privacidade" };
export default function Privacy() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
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
        <h2>O que guardamos</h2>
        <p>
          Se te inscreveres, guardamos o email ou telefone que escolheres, a
          cidade, o código postal, o carrinho simulado e a data do teu
          consentimento. Se representares uma loja, guardamos o nome da loja, a
          cidade, o teu nome e o contacto indicado.
        </p>
        <h2>Para que usamos os dados</h2>
        <p>
          Usamos o teu contacto para comunicar o lançamento e a oferta da
          primeira Jola. A zona e os produtos escolhidos ajudam-nos a decidir
          onde lançar e o que disponibilizar. Os contactos das lojas são usados
          para preparar possíveis parcerias. Não pedimos dados de pagamento.
        </p>
        <h2>O que fica no teu dispositivo</h2>
        <p>
          Guardamos localmente a confirmação de idade, o carrinho, a zona, o
          progresso e um identificador aleatório da sessão. Também guardamos os
          parâmetros da campanha que te trouxe até aqui. Podes apagar estes
          dados nas definições do navegador.
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
          Os dados são enviados para o servidor da Jola e guardados na base de
          dados configurada para o projeto. No ambiente de demonstração local
          ficam no computador que executa a aplicação. O acesso ao painel de
          procura é reservado à equipa do projeto.
        </p>
        <h2>As tuas escolhas</h2>
        <p>
          Podes retirar o consentimento e pedir a consulta, correção ou
          eliminação dos teus dados. Apagar o armazenamento do navegador não
          elimina os dados já enviados ao servidor.
        </p>
        {contact ? (
          <p>
            Para falar com a equipa Jola sobre os teus dados:{" "}
            <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        ) : (
          <p>
            O contacto direto da equipa responsável será publicado aqui antes da
            abertura pública. Esta versão destina-se à validação local do
            conceito.
          </p>
        )}
        <h2>Antes da abertura pública</h2>
        <p>
          A identificação completa do responsável, o contacto de privacidade e o
          prazo de conservação serão publicados nesta página antes da recolha
          pública de contactos.
        </p>
      </main>
      <Footer />
    </>
  );
}
