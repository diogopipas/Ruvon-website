"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="error-page">
      <h1>
        A noite teve
        <br />
        um pequeno percalço.
      </h1>
      <p>
        O teu carrinho continua guardado neste dispositivo. Tenta carregar a
        página outra vez.
      </p>
      <button className="button button-primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
