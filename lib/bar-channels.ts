export const serviceNames: Record<string, string> = {
  TABLE: "Comer en el local",
  DINE_IN: "Comer en el local",
  BAR: "Barra · Comer en el local",
  TAKEAWAY: "Para llevar",
  PICKUP: "Recoger en el local",
  DELIVERY: "Delivery",
  COURTESY: "Cortesía",
  INTERNAL: "Consumo interno",
};
export const deliveryNames: Record<string, string> = {
  PEYA: "PedidosYa",
  WHATSAPP: "WhatsApp",
  VALAZO: "Valazo",
  DIRECT: "Directo",
  OTHER: "Otro",
};
export function serviceLabel(order: {
  channel: string;
  deliverySource?: string;
}) {
  return (
    (serviceNames[order.channel] || order.channel) +
    (order.channel === "DELIVERY" && order.deliverySource
      ? " · " + (deliveryNames[order.deliverySource] || order.deliverySource)
      : "")
  );
}
