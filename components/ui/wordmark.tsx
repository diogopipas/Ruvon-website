import Link from "next/link";
export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <Link
      href="/"
      className={`wordmark ${large ? "wordmark-large" : ""}`}
      aria-label="Jola — página inicial"
    >
      JOLA<span className="wordmark-dot">®</span>
    </Link>
  );
}
