import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
export const metadata: Metadata = { title: "Termos da experiência" };
export default function Terms() {
  return (
    <>
      <Header />
      <main id="main" className="container legal-page">
        <Link className="back-link" href="/">
          Voltar ao início
        </Link>
        <h1>
          Boas noites.
          <br />
          Tudo às claras.
        </h1>
        <h2>Uma antevisão da Jola</h2>
        <p>
          A Jola é atualmente um conceito em fase de validação. O catálogo, os
          carrinhos, os preços, as taxas e os tempos de entrega apresentados são
          ilustrativos. Não estão a ser aceites encomendas reais. Não há vendas,
          pagamentos, reservas de produtos ou entregas.
        </p>
        <h2>Para maiores de 18 anos</h2>
        <p>
          A experiência destina-se a adultos. Ao confirmares a tua idade,
          declaras que tens 18 anos ou mais. A confirmação não substitui os
          controlos necessários para uma futura operação.
        </p>
        <h2>Produtos e marcas</h2>
        <p>
          Os nomes dos produtos servem para testar a procura. As ilustrações são
          representações de demonstração e não fotografias das embalagens. A sua
          presença não implica uma parceria com as marcas ou disponibilidade
          futura.
        </p>
        <h2>A oferta da primeira Jola</h2>
        <p>
          A inscrição permite receber novidades e uma oferta prevista de 5 € na
          primeira Jola, quando o serviço lançar na tua zona. O lançamento, a
          cobertura e a data ainda não estão definidos. As condições finais,
          incluindo validade e eventual valor mínimo do pedido, serão
          comunicadas antes da utilização da oferta. Não há qualquer pagamento
          nesta fase.
        </p>
        <h2>Interesse de lojas</h2>
        <p>
          Preencher o formulário de parceiro manifesta interesse numa futura
          conversa. Não cria um contrato, exclusividade ou obrigação comercial.
        </p>
        <h2>Os teus dados</h2>
        <p>
          Consulta a <Link href="/privacidade">Privacidade</Link> para saber que
          dados guardamos durante esta experiência.
        </p>
      </main>
      <Footer />
    </>
  );
}
