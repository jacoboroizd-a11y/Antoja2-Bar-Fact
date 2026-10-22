import type { SalesOutlook } from "@/lib/sales-forecast";
import { formatMoney } from "@/lib/money";
export function SalesProjection({
  forecast: outlook,
}: {
  forecast: SalesOutlook;
}) {
  const f = outlook.day;
  const month = outlook.month;
  const completed = f.status === "completed";
  const signed = (v: number) => (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  const ceiling = Math.max(
    1,
    ...f.points.flatMap((p) => [p.expected, p.actual || 0]),
  );
  const line = (actual: boolean) =>
    f.points
      .flatMap((p, i) => {
        const v = actual ? p.actual : p.expected;
        return v === null ? [] : [`${20 + i * 20},${100 - (v / ceiling) * 80}`];
      })
      .join(" ");
  return (
    <section aria-label="Proyección de ventas" className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          {completed ? "Resultado de la jornada" : "Ventas proyectadas"}
        </h2>
        <span className="text-xs text-slate-500">{f.date} · Managua</span>
      </div>
      {f.status === "insufficient" ? (
        <p className="text-sm text-slate-500 mt-3">
          Necesitamos al menos 3 días anteriores cerrados para estimar el
          cierre. Disponibles: {f.count}. Las ventas de hoy se incorporan a
          medida que se cobran.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <div>
              <p className="text-xs text-slate-500">Ventas pagadas</p>
              <p className="text-xl font-semibold mt-1">
                {formatMoney(f.actual)}
              </p>
            </div>
            {!completed && (
              <div>
                <p className="text-xs text-brand-700">Cierre estimado</p>
                <p className="text-xl font-semibold text-brand-800 mt-1">
                  {formatMoney(f.estimate || 0)}
                </p>
              </div>
            )}
            {!completed && (
              <div className="col-span-2 lg:col-span-1">
                <p className="text-xs text-slate-500">Rango orientativo</p>
                <p className="text-sm font-medium mt-1">
                  {formatMoney(f.lower || 0)} – {formatMoney(f.upper || 0)}
                </p>
              </div>
            )}
          </div>
          {!completed && (
            <p className="text-xs text-slate-500 mt-3">
              Historial {f.confidence.toLowerCase()}: {f.count} días cerrados ·{" "}
              {f.similarDays} del mismo día de la semana.
              {f.rhythm !== null
                ? ` Ritmo actual ${signed(f.rhythm)} frente a lo esperado a esta hora.`
                : f.status === "scheduled"
                  ? " Se ajustará al comenzar la jornada."
                  : " Todavía es temprano para comparar el ritmo por hora."}
            </p>
          )}
        </>
      )}
      {!completed && f.estimate !== null && (
        <p className="text-xs text-slate-500 mt-2">
          Por vender hoy, aproximadamente:{" "}
          <strong>{formatMoney(Math.max(0, f.estimate - f.actual))}</strong>.
        </p>
      )}
      {month && (
        <div className="border-t border-slate-100 mt-4 pt-3">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">
                Por vender en el resto del mes
              </p>
              <p className="text-xl font-semibold text-brand-800">
                {month.remaining === null
                  ? "Falta historial"
                  : formatMoney(month.remaining)}
              </p>
            </div>
            <div className="text-sm">
              <p>
                Mes vendido: <strong>{formatMoney(month.actual)}</strong>
              </p>
              <p className="text-slate-500">
                Cierre estimado del mes:{" "}
                {month.total === null ? "—" : formatMoney(month.total)}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Incluye lo pendiente de hoy y {month.daysRemaining - 1} días
            siguientes. Supone que abrís todos los días restantes. No cambia tus
            ventas ni tu caja.
          </p>
        </div>
      )}
      {f.holiday && (
        <p className="text-xs text-amber-800 mt-2">
          {f.holiday} ·{" "}
          {f.holidayComparables < 2
            ? "Pocos feriados comparables; estimación con mayor incertidumbre."
            : `${f.holidayComparables} feriados anteriores comparables.`}
        </p>
      )}
      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer text-brand-700">
          Cómo se calcula
        </summary>
        <div className="mt-3 grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p>
              Usamos hasta 8 semanas de jornadas cerradas. Los días recientes y
              el mismo día de la semana pesan más; también comparamos
              viernes/sábados con días similares.
            </p>
            <p>
              El ritmo de ventas pagadas a la misma hora ajusta la estimación
              durante el día. Se incluyen impuestos y propinas; se excluyen
              órdenes abiertas y anuladas. Los gastos se muestran aparte.
            </p>
            {f.recentChange !== null && (
              <p>
                Promedio de los últimos 14 días frente a las semanas anteriores:{" "}
                {signed(f.recentChange)}.
              </p>
            )}
            <p>
              Las fechas sin una jornada registrada no se cuentan como ventas
              cero. El rango refleja variación histórica, no una garantía.
            </p>
            {completed && (
              <p>
                Esta jornada ya terminó: mostramos el resultado real, sin
                reconstruir una predicción con datos posteriores.
              </p>
            )}
            <p>
              Feriados nacionales de Nicaragua (incluye Semana Santa), días de
              quincena y fin de mes se comparan por separado. Para feriados
              buscamos hasta 2 años; no aplicamos aumentos arbitrarios cuando
              faltan comparables. No incluye fiestas locales ni feriados
              extraordinarios.
            </p>
            {month && month.holidays.length > 0 && (
              <p>
                Próximos feriados:{" "}
                {month.holidays
                  .map(
                    (h) =>
                      `${h.date}: ${h.name}${h.comparables < 2 ? " (historial limitado)" : ""}`,
                  )
                  .join(" · ")}
                .
              </p>
            )}
            <p>
              Actualizado:{" "}
              {new Date(f.updatedAt).toLocaleTimeString("es-NI", {
                timeZone: "America/Managua",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          </div>
          {f.baseline !== null && !completed && (
            <div>
              <svg
                viewBox="0 0 300 125"
                className="w-full max-w-md"
                role="img"
                aria-label="Ventas acumuladas: línea gris esperada por historial y línea borgoña real"
              >
                <line x1="20" y1="100" x2="280" y2="100" stroke="#e2e8f0" />
                <polyline
                  points={line(false)}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                <polyline
                  points={line(true)}
                  fill="none"
                  stroke="#701c35"
                  strokeWidth="3"
                />
                <text x="20" y="117" fontSize="9" fill="#64748b">
                  11:30
                </text>
                <text x="249" y="117" fontSize="9" fill="#64748b">
                  00:30
                </text>
              </svg>
              <p>Gris: acumulado esperado · Borgoña: ventas reales.</p>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
