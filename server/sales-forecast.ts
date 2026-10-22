import { db } from "./db";
import { requireBar } from "./bar-permissions";
import type { Context } from "./auth";
import { barClock } from "@/lib/bar-time";
import { holiday } from "@/lib/bar-calendar";
import { forecastSales, forecastMonth } from "@/lib/sales-forecast";
export async function salesForecast(
  ctx: Context,
  target = barClock().date,
  now = new Date(),
) {
  requireBar(ctx, "reports");
  const first = new Date(target + "T00:00:00Z");
  first.setUTCDate(first.getUTCDate() - 56);
  const today = barClock(now).date;
  const keys = new Set<string>();
  const monthEnd = new Date(today.slice(0, 7) + "-01T00:00:00Z");
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  for (
    let d = new Date(today + "T00:00:00Z");
    d < monthEnd;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const h = holiday(d.toISOString().slice(0, 10));
    if (h) keys.add(h.key);
  }
  const targetHoliday = holiday(target);
  if (targetHoliday) keys.add(targetHoliday.key);
  const historicalHolidays: Date[] = [];
  for (let i = 1; keys.size && i <= 730; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const date = d.toISOString().slice(0, 10);
    if (keys.has(holiday(date)?.key || ""))
      historicalHolidays.push(new Date(date));
  }
  const days = await db.businessDay.findMany({
    where: {
      companyId: ctx.companyId,
      OR: [
        { date: { gte: first, lte: new Date(target + "T00:00:00Z") } },
        { date: { in: historicalHolidays } },
      ],
    },
    select: {
      date: true,
      status: true,
      orders: {
        where: { status: "PAID", closedAt: { lte: now } },
        select: { closedAt: true, total: true },
      },
    },
    orderBy: { date: "asc" },
  });
  // A date can contain multiple authorized cash shifts; group them into one day.
  const grouped = new Map<
    string,
    { date: string; closed: boolean; sales: { at: string; total: number }[] }
  >();
  for (const day of days) {
    const date = day.date.toISOString().slice(0, 10);
    const row = grouped.get(date) || { date, closed: true, sales: [] };
    row.closed &&= day.status === "CLOSED";
    row.sales.push(
      ...day.orders
        .filter((o) => o.closedAt)
        .map((o) => ({
          at: o.closedAt!.toISOString(),
          total: Number(o.total),
        })),
    );
    grouped.set(date, row);
  }
  const data = [...grouped.values()];
  return {
    day: forecastSales(data, target, now),
    month: target === today ? forecastMonth(data, now) : null,
  };
}
