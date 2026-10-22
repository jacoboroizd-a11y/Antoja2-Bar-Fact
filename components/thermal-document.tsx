"use client";
import { useSyncExternalStore, useState, useRef } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { Button } from "./ui/button";
import { formatMoney, decimal } from "@/lib/money";
type ThermalData = {
  kind: string;
  companyName: string;
  orderId: string;
  number: number;
  documentNumber: string;
  table: string;
  responsible: string;
  customer: string;
  date: string;
  businessDate: string;
  notes: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    notes: string;
    unitPrice?: string;
  }[];
  subtotal: string;
  discount: string;
  tax: string;
  tip: string;
  total: string;
  payments: { amount: string; method: string; person: string }[];
};
export function ThermalDocument({ data: d }: { data: ThermalData }) {
  const paper = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(297);
  const print = () => {
    flushSync(() =>
      setHeight(
        Math.max(
          60,
          Math.ceil(((paper.current?.scrollHeight || 600) * 25.4) / 96) + 8,
        ),
      ),
    );
    window.print();
  };
  const [paperPreference, setPaperPreference] = usePreference(
    "antoja2-paper-" + d.kind,
    "80",
  );
  const width = paperPreference === "58" ? "58" : "80";
  const setWidth = setPaperPreference;
  const [printer, setPrinter] = usePreference("antoja2-printer-" + d.kind, "");
  const methods: Record<string, string> = {
    CASH: "Efectivo",
    CARD: "Tarjeta",
    BANK_TRANSFER: "Transferencia",
    COURTESY: "Cortesía",
    OTHER: "Otro",
  };
  const kitchen = d.kind === "kitchen";
  return (
    <div>
      <div className="no-print panel p-5 max-w-2xl mx-auto mb-6 space-y-4">
        <h1 className="text-xl font-semibold">
          {kitchen
            ? "Comanda · Impresora de cocina"
            : "Factura restaurante · Impresora de caja"}
        </h1>
        <p className="text-sm text-slate-500">
          Elegí la impresora de {kitchen ? "cocina" : "caja"} en el diálogo del
          navegador. Escala 100%, márgenes ninguno, encabezados y pies
          desactivados.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label>
            Ancho del rollo
            <select
              value={width}
              onChange={(e) => {
                setWidth(e.target.value);
              }}
            >
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </select>
          </label>
          <label>
            Nombre de referencia de la impresora
            <input
              className="border rounded-xl p-3 w-full"
              value={printer}
              placeholder={kitchen ? "Cocina" : "Caja"}
              onChange={(e) => {
                setPrinter(e.target.value);
              }}
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          La referencia se guarda en este dispositivo; el navegador controla la
          selección real. Enviar una comanda no confirma que haya salido
          físicamente por la impresora.
        </p>
        <div className="flex gap-3">
          <Button onClick={print}>
            Imprimir {kitchen ? "comanda" : "factura"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={"/bar/orders?order=" + d.orderId}>
              Volver a la orden
            </Link>
          </Button>
        </div>
      </div>
      <style>{`@media print { @page { size: ${width}mm ${height}mm; margin: 0; } html, body { width: ${width}mm !important; min-width: 0 !important; padding: 0 !important; margin: 0 !important; } .thermal-paper { width: ${width}mm !important; margin: 0 !important; padding: 3mm !important; box-shadow: none !important; font-size: ${width === "58" ? "10" : "12"}px !important; } main { max-width: none !important; } }`}</style>
      <article
        ref={paper}
        className="thermal-paper bg-white text-black mx-auto p-5 shadow-md font-mono"
        style={{
          width: width + "mm",
          padding: "3mm",
          fontSize: width === "58" ? 10 : 12,
        }}
      >
        <div className="text-center">
          <h2 className="text-lg font-bold">{d.companyName}</h2>
          <p className="font-bold mt-2">
            {kitchen ? "*** COMANDA COCINA ***" : "FACTURA RESTAURANTE"}
          </p>
          <p>{d.documentNumber}</p>
          <p>
            Orden #{d.number} · {d.table}
          </p>
        </div>
        <div className="border-y border-dashed border-black my-3 py-2">
          <p>
            {new Date(d.date).toLocaleString("es-NI", {
              timeZone: "America/Managua",
            })}
          </p>
          <p>Jornada: {d.businessDate}</p>
          <p>Atiende: {d.responsible}</p>
          {!kitchen && <p>Cliente: {d.customer}</p>}
        </div>
        {d.items.map((i) => (
          <div
            className="border-b border-dashed border-black py-2 break-inside-avoid"
            key={i.id}
          >
            <p className={kitchen ? "font-bold text-lg" : "font-bold"}>
              {i.quantity} × {i.name}
            </p>
            {i.notes && (
              <p className={kitchen ? "font-bold text-base" : "text-xs"}>
                *** {i.notes} ***
              </p>
            )}
            {!kitchen && i.unitPrice && (
              <p className="flex justify-between">
                <span>{formatMoney(i.unitPrice)} c/u</span>
                <span>
                  {formatMoney(decimal(i.unitPrice).times(i.quantity))}
                </span>
              </p>
            )}
          </div>
        ))}
        {d.notes && <p className="my-3 font-bold">Notas: {d.notes}</p>}
        {!kitchen && (
          <>
            <div className="my-3 space-y-1">
              {[
                ["Subtotal", d.subtotal],
                ["Descuento", d.discount],
                ["Impuesto", d.tax],
                ["Propina", d.tip],
              ].map(([l, v]) => (
                <p className="flex justify-between" key={l}>
                  <span>{l}</span>
                  <span>{formatMoney(v)}</span>
                </p>
              ))}
              <p className="flex justify-between font-bold text-lg border-t border-dashed border-black pt-2">
                <span>TOTAL</span>
                <span>{formatMoney(d.total)}</span>
              </p>
            </div>
            <div className="border-t border-dashed border-black pt-2">
              {d.payments.map((p, i) => (
                <p className="flex justify-between" key={i}>
                  <span>
                    {methods[p.method] || p.method}
                    {p.person ? " · " + p.person : ""}
                  </span>
                  <span>{formatMoney(p.amount)}</span>
                </p>
              ))}
            </div>
            <p className="text-center mt-5">¡Gracias por tu visita!</p>
            <p className="text-center text-[9px] mt-2">
              Comprobante de restaurante. Sin validez como factura fiscal.
            </p>
          </>
        )}
        {kitchen && (
          <p className="text-center text-xs mt-4">
            Solo platos nuevos de este envío · Reimprimir conserva el mismo
            número de comanda.
          </p>
        )}
      </article>
    </div>
  );
}

function subscribePreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("antoja2-preference", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("antoja2-preference", callback);
  };
}
function usePreference(
  key: string,
  fallback: string,
): [string, (value: string) => void] {
  const current = useSyncExternalStore(
    subscribePreferences,
    () => {
      try {
        return localStorage.getItem(key) || fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  return [
    current,
    (value) => {
      try {
        localStorage.setItem(key, value);
        window.dispatchEvent(new Event("antoja2-preference"));
      } catch {}
    },
  ];
}
