export default function Loading() {
  return (
    <main
      id="main"
      className="catalog-skeleton container"
      role="status"
      aria-label="A preparar a Jola"
    >
      <div />
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} />
      ))}
    </main>
  );
}
