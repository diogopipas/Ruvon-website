import Link from "next/link";
import Image from "next/image";
export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <Link
      href="/"
      className={`wordmark ${large ? "wordmark-large" : ""}`}
      aria-label="Ruvon — página inicial"
    >
      <Image
        src="/images/brand/ruvon-logo.svg"
        alt="Ruvon"
        width={380}
        height={76}
        unoptimized
      />
    </Link>
  );
}
