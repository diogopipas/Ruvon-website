import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
export const metadata: Metadata = { title: "Termos de utilização" };
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
        <h2>Catálogo e registo de interesse</h2>
        <p>
          Podes consultar o catálogo, compor um carrinho e registar interesse na
          tua zona. Os produtos e preços apresentados não confirmam stock ou
          cobertura de entrega. O registo de interesse não conclui uma compra,
          não cobra pagamentos nem reserva produtos ou entregas.
        </p>
        <h2>Para maiores de 18 anos</h2>
        <p>
          A experiência destina-se a adultos. Ao confirmares a tua idade,
          declaras que tens 18 anos ou mais. A confirmação não substitui os
          outras verificações de idade.
        </p>
        <h2>Produtos e marcas</h2>
        <p>
          Os nomes identificam os produtos apresentados. As ilustrações não são
          fotografias das embalagens. A presença de uma marca no catálogo não
          implica uma parceria ou confirmação de disponibilidade.
        </p>
        <h2>Avisos de disponibilidade</h2>
        <p>
          Ao inscreveres-te, pedes para receber avisos sobre a disponibilidade
          da Ruvon na tua zona. A inscrição não é uma encomenda e não implica
          pagamento.
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
