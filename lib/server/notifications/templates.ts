import type { CommerceOrder } from "@/lib/commerce";
import type { EmailRequest } from "./resend";

const updates: Partial<Record<CommerceOrder["operational_status"], string>> = {
  awaiting_merchant:
    "Pagamento autorizado. A loja está a confirmar o teu pedido. Ainda não começou a preparação.",
  confirming:
    "A loja aceitou. Estamos a confirmar o pagamento e a entrega antes de começar a preparação.",
  preparing:
    "Pagamento e entrega confirmados. A loja já pode preparar o teu pedido.",
  ready_for_pickup: "O teu pedido está pronto para recolha.",
  in_delivery:
    "O estafeta recolheu o teu pedido. Acompanha a entrega na página do pedido.",
  delivered: "A entrega do teu pedido foi confirmada.",
  cancelling:
    "Recebemos o cancelamento. Estamos a confirmar o encerramento da entrega e a regularização do pagamento.",
  cancelled:
    "O cancelamento e a regularização do pagamento foram confirmados. Consulta o estado na página do pedido.",
  returning:
    "A entrega não foi concluída. O pedido está a regressar à loja e a resolução será analisada.",
  returned:
    "O regresso à loja foi confirmado. Estamos a analisar a resolução do pedido.",
  manual_review:
    "O teu pedido precisa de acompanhamento da equipa. Consulta as atualizações na página do pedido.",
};

export function notificationText(
  purpose: string,
  order: CommerceOrder,
  origin: string,
  state = order.operational_status,
) {
  const reference = order.id.slice(0, 8).toUpperCase();
  if (purpose === "merchant_notify")
    return {
      subject: `Ruvon: novo pedido ${reference}`,
      text: `Tens um novo pedido para confirmar. Aceita ou rejeita no painel antes do prazo de três minutos. A aceitação confirma o stock; aguarda a indicação de que podes preparar.\n\n${origin}/merchant`,
    };
  if (purpose === "preparation_reminder")
    return {
      subject: `Ruvon: preparação do pedido ${reference}`,
      text: `Confirma a preparação e marca o pedido como pronto quando estiver completo e selado.\n\n${origin}/merchant`,
    };
  if (purpose === "merchant_preparation")
    return {
      subject: `Ruvon: podes preparar o pedido ${reference}`,
      text: `O pagamento e a criação da entrega estão confirmados. Já podes preparar o pedido. Confirma todos os produtos e a selagem antes de marcar como pronto.\n\n${origin}/merchant`,
    };
  if (purpose === "operator_alert")
    return {
      subject: `Ruvon: pedido ${reference} precisa de revisão`,
      text: `Existe uma exceção por analisar. Consulta o motivo, o histórico e as ações permitidas no painel autenticado.\n\n${origin}/admin/orders/${order.id}`,
    };
  if (purpose === "customer_update" && updates[state])
    return {
      subject: `Ruvon: atualização do pedido ${reference}`,
      text: `${updates[state]}\n\nAbre esta página no dispositivo onde fizeste o pedido:\n${origin}/pedido/${order.id}\n\nO link não dá acesso ao pedido noutros dispositivos.`,
    };
  if (purpose === "customer_refund")
    return {
      subject: `Ruvon: reembolso do pedido ${reference}`,
      text: `O prestador de pagamentos confirmou um reembolso. Consulta o montante e o estado atualizado no dispositivo onde fizeste o pedido:\n${origin}/pedido/${order.id}`,
    };
  throw new Error("unsupported_notification_template");
}

export function emailRequest(
  id: string,
  environment: string,
  sender: { from: string; replyTo: string },
  recipient: string,
  message: { subject: string; text: string },
): EmailRequest {
  return {
    from: sender.from,
    to: [recipient],
    reply_to: sender.replyTo,
    subject: `${environment === "sandbox" ? "[TESTE] " : ""}${message.subject}`,
    text: message.text,
    tags: [
      { name: "notification_id", value: id },
      { name: "environment", value: environment },
    ],
  };
}
