const labels: Record<string, string> = {
  ENTRY: "Entrada",
  EXIT: "Salida",
  ADJUSTMENT: "Ajuste",
  SALE: "Venta",
  WAREHOUSE_PURCHASE: "Compra",
  TRANSFER_IN: "Traslado recibido",
  TRANSFER_OUT: "Traslado enviado",
  WAREHOUSE_LOSS: "Pérdida o merma",
};
export const stockLabel = (type: string) => labels[type] || type;
