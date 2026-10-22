import { holiday, payPeriod } from "./bar-calendar";
import { barClock } from "./bar-time";
export type ForecastDay = {
  date: string;
  closed: boolean;
  sales: { at: string; total: number }[];
};
const start = (date: string) => Date.parse(date + "T11:30:00-06:00");
const dayMs = 86400000;
const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
const weekend = (date: string) => [5, 6].includes(weekday(date));
const round = (n: number) => Math.round(n * 100) / 100;
const sum = (d: ForecastDay, cutoff = Infinity) =>
  d.sales.reduce((n, s) => n + (Date.parse(s.at) <= cutoff ? s.total : 0), 0);
/** Descriptive weighted forecast, not an accounting balance or calibrated probability. */
export function forecastSales(
  days: ForecastDay[],
  target: string,
  now = new Date(),
) {
  const today = barClock(now).date;
  const elapsed = Math.max(
    0,
    Math.min(13 * 3600000, now.getTime() - start(target)),
  );
  const targetDay = days.find((d) => d.date === target);
  const actual = round(targetDay ? sum(targetDay, now.getTime()) : 0);
  // Only completed prior dates: open shifts and future data never train the model.
  const event = holiday(target);
  const trainingDate = target < today ? target : today;
  const history = days
    .filter(
      (d) =>
        d.closed &&
        d.date < target &&
        d.date < today &&
        ((start(trainingDate) - start(d.date)) / dayMs <= 56 ||
          (event !== null &&
            holiday(d.date)?.key === event.key &&
            (start(trainingDate) - start(d.date)) / dayMs <= 730)),
    )
    .map((d) => {
      const age = (start(trainingDate) - start(d.date)) / dayMs;
      return {
        ...d,
        age,
        total: sum(d),
        weight:
          (event && holiday(d.date)?.key === event.key
            ? 4 * Math.exp(-age / 730)
            : Math.exp(-age / 28)) *
          (Boolean(holiday(d.date)) !== Boolean(event) ? 0.35 : 1) *
          (payPeriod(d.date) === payPeriod(target) ? 1.15 : 1) *
          (weekday(d.date) === weekday(target)
            ? 3
            : weekend(d.date) === weekend(target)
              ? 1.35
              : 1),
      };
    });
  const holidayComparables = event
    ? history.filter((d) => holiday(d.date)?.key === event.key).length
    : 0;
  const count = history.length;
  const similarDays = history.filter(
    (d) => weekday(d.date) === weekday(target),
  ).length;
  const weight = history.reduce((n, d) => n + d.weight, 0);
  const mean = (rows: typeof history) =>
    rows.length ? rows.reduce((n, d) => n + d.total, 0) / rows.length : null;
  const recent = mean(history.filter((d) => d.age <= 14 && !holiday(d.date)));
  const prior = mean(
    history.filter((d) => d.age > 14 && d.age <= 42 && !holiday(d.date)),
  );
  // Shrink the recent change, and bound its influence on a sparse sample.
  const trend =
    recent !== null && prior !== null && prior > 0
      ? Math.max(0.8, Math.min(1.2, 1 + (recent / prior - 1) * 0.5))
      : 1;
  const baseline = weight
    ? (history.reduce((n, d) => n + d.total * d.weight, 0) / weight) * trend
    : 0;
  const historyTotal = history.reduce((n, d) => n + d.total * d.weight, 0);
  const cumulative = (millis: number) =>
    historyTotal
      ? history.reduce(
          (n, d) => n + sum(d, start(d.date) + millis) * d.weight,
          0,
        ) / historyTotal
      : 0;
  const fraction = cumulative(elapsed);
  const completed =
    target < today ||
    Boolean(targetDay?.closed) ||
    (target === today && now.getTime() >= start(target) + 13 * 3600000);
  const status = completed
    ? "completed"
    : count < 3
      ? "insufficient"
      : target > today || now.getTime() < start(target)
        ? "scheduled"
        : "live";
  const liveWeight =
    status === "live" && fraction >= 0.08 ? Math.min(0.85, fraction * 0.85) : 0;
  const estimate =
    status === "insufficient"
      ? null
      : status === "completed"
        ? actual
        : Math.max(
            actual,
            baseline * (1 - liveWeight) +
              (fraction ? actual / fraction : baseline) * liveWeight,
          );
  const variance = weight
    ? history.reduce((n, d) => n + d.weight * (d.total - baseline) ** 2, 0) /
      weight
    : 0;
  const spread =
    Math.max(Math.sqrt(variance) * 1.28, baseline * (count < 14 ? 0.35 : 0.2)) *
    (status === "live" ? Math.max(0.15, 1 - fraction * 0.75) : 1);
  const holidaySpread =
    event && holidayComparables < 2 ? Math.max(spread, baseline * 0.5) : spread;
  const expectedNow = baseline * fraction;
  const rhythm =
    status === "live" && fraction >= 0.08 && expectedNow > 0
      ? round((actual / expectedNow - 1) * 100)
      : null;
  const points = Array.from({ length: 14 }, (_, hour) => ({
    hour: 11.5 + hour,
    expected: round(baseline * cumulative(hour * 3600000)),
    actual:
      targetDay && hour * 3600000 <= elapsed
        ? round(
            sum(
              targetDay,
              Math.min(now.getTime(), start(target) + hour * 3600000),
            ),
          )
        : null,
  }));
  return {
    holiday: event?.name || null,
    holidayComparables,
    date: target,
    status,
    actual,
    estimate: estimate === null ? null : round(estimate),
    lower:
      estimate === null
        ? null
        : round(
            status === "completed"
              ? actual
              : Math.max(actual, estimate - holidaySpread),
          ),
    upper:
      estimate === null
        ? null
        : round(status === "completed" ? actual : estimate + holidaySpread),
    baseline: count >= 3 ? round(baseline) : null,
    count,
    similarDays,
    confidence:
      count >= 28 && similarDays >= 4
        ? "Amplio"
        : count >= 14 && similarDays >= 2
          ? "Moderado"
          : "Limitado",
    recentChange:
      recent !== null && prior !== null && prior > 0
        ? round((recent / prior - 1) * 100)
        : null,
    rhythm,
    points,
    updatedAt: now.toISOString(),
  };
}
export type SalesForecast = ReturnType<typeof forecastSales>;

export function forecastMonth(days: ForecastDay[], now = new Date()) {
  const today = barClock(now).date;
  const end = new Date(today.slice(0, 7) + "-01T00:00:00Z");
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const forecasts: SalesForecast[] = [];
  for (let date = today; date <= end.toISOString().slice(0, 10);) {
    forecasts.push(forecastSales(days, date, now));
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
  }
  const actual = round(
    days
      .filter(
        (d) => d.date.slice(0, 7) === today.slice(0, 7) && d.date <= today,
      )
      .reduce((n, d) => n + sum(d, now.getTime()), 0),
  );
  const enough = forecasts.every((f) => f.estimate !== null);
  const remaining = enough
    ? round(
        forecasts.reduce((n, f) => n + Math.max(0, f.estimate! - f.actual), 0),
      )
    : null;
  return {
    period: today.slice(0, 7),
    actual,
    remaining,
    total: remaining === null ? null : round(actual + remaining),
    lower: !enough
      ? null
      : round(
          actual +
            forecasts.reduce((n, f) => n + Math.max(0, f.lower! - f.actual), 0),
        ),
    upper: !enough
      ? null
      : round(
          actual +
            forecasts.reduce((n, f) => n + Math.max(0, f.upper! - f.actual), 0),
        ),
    daysRemaining: forecasts.length,
    holidays: forecasts
      .filter((f) => f.holiday)
      .map((f) => ({
        date: f.date,
        name: f.holiday!,
        comparables: f.holidayComparables,
      })),
  };
}
export type SalesOutlook = {
  day: SalesForecast;
  month: ReturnType<typeof forecastMonth> | null;
};
