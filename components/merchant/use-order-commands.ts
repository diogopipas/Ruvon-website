"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantCommand } from "@/lib/commerce";
import { HttpResponseError, postJson } from "@/lib/client-request";

export type MerchantIntent = Omit<MerchantCommand, "command_id">;
export type MerchantAttempt = {
  orderId: string;
  input: MerchantCommand;
  phase: "pending" | "confirmed" | "rejected";
  busy: boolean;
  error: string;
};

export function useOrderCommands({
  enabled,
  refresh,
  onAccessDenied,
}: {
  enabled: boolean;
  refresh: () => Promise<void>;
  onAccessDenied: () => void;
}) {
  const current = useRef(new Map<string, MerchantAttempt>());
  const active = useRef(false);
  const allowed = useRef(enabled);
  const [attempts, setAttempts] = useState(new Map<string, MerchantAttempt>());
  const [message, setMessage] = useState("");
  // Reset private UI state before committing a render without store access.
  if (!enabled && (attempts.size > 0 || message)) {
    setAttempts(new Map());
    setMessage("");
  }

  const clear = useCallback(() => {
    current.current.clear();
    setAttempts(new Map());
    setMessage("");
  }, []);
  useEffect(() => {
    const pending = current.current;
    active.current = true;
    return () => {
      active.current = false;
      pending.clear();
    };
  }, []);
  useEffect(() => {
    allowed.current = enabled;
    if (!enabled) current.current.clear();
  }, [enabled]);

  async function send(attempt: MerchantAttempt) {
    if (
      !active.current ||
      !allowed.current ||
      attempt.busy ||
      current.current.get(attempt.orderId) !== attempt
    )
      return;
    const valid = () =>
      active.current &&
      allowed.current &&
      current.current.get(attempt.orderId) === attempt;
    attempt.busy = true;
    attempt.error = "";
    setAttempts(new Map(current.current));
    try {
      if (attempt.phase === "pending") {
        await postJson(
          `/api/merchant/orders/${attempt.orderId}/commands`,
          attempt.input,
        );
        if (!valid()) return;
        attempt.phase = "confirmed";
      }
      // Once POST is acknowledged (or definitively rejected), recovery is a read.
      await refresh();
      if (!valid()) return;
      current.current.delete(attempt.orderId);
      setAttempts(new Map(current.current));
      setMessage(
        attempt.phase === "rejected"
          ? "Pedido atualizado. Revê o estado antes de escolher outra ação."
          : attempt.input.command === "return_received"
            ? "Receção guardada. A resolução financeira fica em análise."
            : "Ação registada e pedido atualizado.",
      );
    } catch (error) {
      if (!valid()) return;
      if (error instanceof HttpResponseError) {
        if (error.status === 401 || error.status === 403) {
          allowed.current = false;
          clear();
          onAccessDenied();
          return;
        }
        // The guarded RPC returns the original outcome before checking version.
        // Only definitive application rejections close this intent. A timeout,
        // throttling or infrastructure failure retains the original command.
        if (
          attempt.phase === "pending" &&
          [400, 404, 409, 413, 415, 422].includes(error.status)
        )
          attempt.phase = "rejected";
      }
      attempt.error =
        error instanceof Error
          ? error.message
          : "Não foi possível confirmar a ação.";
    } finally {
      attempt.busy = false;
      if (valid()) setAttempts(new Map(current.current));
    }
  }

  function start(orderId: string, intent: MerchantIntent) {
    // Ref guards also cover two clicks before React renders the disabled state.
    if (!allowed.current || current.current.has(orderId)) return;
    const input = Object.freeze({
      ...intent,
      ...(intent.saleable
        ? { saleable: Object.freeze({ ...intent.saleable }) }
        : {}),
      command_id: crypto.randomUUID(),
    });
    const attempt: MerchantAttempt = {
      orderId,
      input,
      phase: "pending",
      busy: false,
      error: "",
    };
    current.current.set(orderId, attempt);
    setMessage("");
    void send(attempt);
  }

  function recover(orderId: string) {
    const attempt = current.current.get(orderId);
    if (attempt) void send(attempt);
  }

  return {
    attempts,
    message,
    start,
    recover,
    isPending: (orderId: string) => current.current.has(orderId),
  };
}
