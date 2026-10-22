"use client";
import {
  modifierLabel,
  selectModifiers,
  type Modifier,
} from "@/lib/bar-modifiers";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney, decimal } from "@/lib/money";
import type { Snapshot } from "./bar-workspace";
export function ItemCustomizer({
  product,
  initial,
  busy,
  onClose,
  onSave,
}: {
  product: Snapshot["products"][number];
  initial?: Snapshot["orders"][number]["items"][number];
  busy: boolean;
  onClose: () => void;
  onSave: (data: {
    quantity: number;
    notes: string;
    choices: string[];
  }) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saved = (initial?.customizations || []) as Modifier[];
  const available = product.customizations as Modifier[];
  const options = [
    ...available.map((c) => saved.find((s) => s.key === c.key) || c),
    ...saved.filter((s) => !available.some((c) => c.key === s.key)),
  ];
  const [choices, setChoices] = useState(saved.map((c) => c.key));
  const [quantity, setQuantity] = useState(initial?.quantity || 1);
  const prefixes = saved.map(modifierLabel);
  const [notes, setNotes] = useState(
    (initial?.notes || "")
      .split(" · ")
      .filter((n) => !prefixes.includes(n))
      .join(" · "),
  );
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const base = initial
    ? decimal(initial.unitPrice).minus(
        saved.reduce((n, c) => n.plus(c.price), decimal(0)),
      )
    : decimal(product.product.price);
  const total = base
    .plus(
      options
        .filter((c) => choices.includes(c.key))
        .reduce((n, c) => n.plus(c.price), decimal(0)),
    )
    .times(quantity);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="customizer-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%-24px)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#fffafc] p-5 shadow-xl backdrop:bg-[#2c091680]"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            selectModifiers(options, choices);
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Revisá las opciones.",
            );
            return;
          }
          await onSave({ quantity, notes, choices });
        }}
        className="space-y-4"
      >
        <div className="flex justify-between gap-3 items-start">
          <div>
            <h2 id="customizer-title" className="text-xl font-semibold">
              {product.product.name}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {product.product.description || "Preparalo a tu gusto."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
        </div>
        {[
          ...new Set(
            options
              .filter((c) => c.kind === "OPTION")
              .map((c) => c.group || "Preparación"),
          ),
        ].map((group) => {
          const rows = options.filter(
            (c) => c.kind === "OPTION" && (c.group || "Preparación") === group,
          );
          const required = rows.some((c) => c.required);
          return (
            <fieldset key={group}>
              <legend className="font-medium text-sm mb-2">
                {group}{" "}
                <small className="text-slate-500">
                  {required ? "· elegí una" : "· opcional"}
                </small>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {rows.map((c) => (
                  <label
                    key={c.key}
                    className={`flex gap-2 items-center rounded-xl border p-3 min-h-12 text-sm ${choices.includes(c.key) ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white"}`}
                  >
                    <input
                      className="w-5 h-5 accent-brand-700"
                      type="radio"
                      name={group}
                      required={required}
                      checked={choices.includes(c.key)}
                      onChange={() =>
                        setChoices((keys) => [
                          ...keys.filter(
                            (key) => !rows.some((r) => r.key === key),
                          ),
                          c.key,
                        ])
                      }
                    />
                    <span>
                      {c.label}
                      {Number(c.price) > 0 && (
                        <small className="block">+{formatMoney(c.price)}</small>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {!required && rows.some((c) => choices.includes(c.key)) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setChoices((keys) =>
                      keys.filter((key) => !rows.some((r) => r.key === key)),
                    )
                  }
                >
                  Sin esta opción
                </Button>
              )}
            </fieldset>
          );
        })}
        {["REMOVE", "EXTRA"].map((kind) => {
          const rows = options.filter((c) => c.kind === kind);
          return (
            rows.length > 0 && (
              <fieldset key={kind}>
                <legend className="font-medium text-sm mb-2">
                  {kind === "REMOVE" ? "Quitar ingredientes" : "Agregar extras"}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {rows.map((c) => (
                    <label
                      key={c.key}
                      className={`flex gap-2 items-center rounded-xl border p-3 min-h-12 text-sm cursor-pointer ${choices.includes(c.key) ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white"}`}
                    >
                      <input
                        type="checkbox"
                        className="w-5 h-5 accent-brand-700 shrink-0"
                        checked={choices.includes(c.key)}
                        onChange={(e) =>
                          setChoices((r) =>
                            e.target.checked
                              ? [...r, c.key]
                              : r.filter((k) => k !== c.key),
                          )
                        }
                      />
                      <span>
                        {kind === "REMOVE" ? "Sin " : "Extra "}
                        {c.label}
                        {Number(c.price) > 0 && (
                          <small className="block">
                            +{formatMoney(c.price)}
                          </small>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          );
        })}
        {!options.length && (
          <p className="text-sm text-slate-500">
            Este producto no tiene ingredientes ni extras configurados. Podés
            indicar un cambio en las notas.
          </p>
        )}
        <label>
          Otras indicaciones
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            placeholder="Salsa aparte, término de la carne…"
            rows={2}
          />
        </label>
        <div className="flex gap-4 justify-between items-end">
          <label className="w-28">
            Cantidad
            <Input
              aria-label="Cantidad"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <p className="text-lg font-semibold pb-3">
            {formatMoney(total)}
            <small className="block text-xs font-normal text-slate-500">
              Antes de impuestos y descuentos
            </small>
          </p>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy
            ? "Guardando…"
            : initial
              ? "Guardar cambios"
              : `Agregar ${quantity} a la orden`}
        </Button>
      </form>
    </dialog>
  );
}
