"use client";
import Link from "next/link";
import { track } from "@/lib/analytics";
export function OrderLink({
  children = "Pedir uma Ruvon",
  source = "landing",
  className = "button button-primary",
  href = "/pedir",
}: {
  children?: React.ReactNode;
  source?: string;
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => track("order_cta_clicked", { source })}
    >
      {children}
    </Link>
  );
}
