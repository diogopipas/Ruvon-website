"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { track } from "@/lib/analytics";
export function OrderLink({
  children = "Pedir uma Jola",
  source = "landing",
  className = "button button-primary",
  href = "/pedir",
  arrow = true,
}: {
  children?: React.ReactNode;
  source?: string;
  className?: string;
  href?: string;
  arrow?: boolean;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => track("order_cta_clicked", { source })}
    >
      {children}
      {arrow && <ArrowUpRight size={20} />}
    </Link>
  );
}
