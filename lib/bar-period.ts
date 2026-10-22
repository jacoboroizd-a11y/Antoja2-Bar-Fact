import { barClock } from "./bar-time";
export function barPeriod(
  kind: "day" | "month",
  period?: string,
  now = new Date(),
) {
  const current = barClock(now).date;
  const value = period || (kind === "day" ? current : current.slice(0, 7));
  if (!(kind === "day" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(value))
    throw new Error("Período inválido.");
  const start = new Date(
    (kind === "day" ? value : value + "-01") + "T00:00:00Z",
  );
  if (
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, kind === "day" ? 10 : 7) !== value
  )
    throw new Error("Fecha inválida.");
  const end = new Date(start);
  if (kind === "day") end.setUTCDate(end.getUTCDate() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    kind,
    period: value,
    start,
    end,
    label: kind === "day" ? "Jornada " + value : "Mes " + value,
  };
}
