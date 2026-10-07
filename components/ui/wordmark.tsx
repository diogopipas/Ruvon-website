import Link from "next/link";
export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <Link
      href="/"
      className={`wordmark ${large ? "wordmark-large" : ""}`}
      aria-label="Ruvon — página inicial"
    >
      RUVON
    </Link>
  );
}
