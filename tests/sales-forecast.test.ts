import { describe, it, expect } from "vitest";
import {
  forecastSales,
  forecastMonth,
  type ForecastDay,
} from "../lib/sales-forecast";
import { holiday } from "../lib/bar-calendar";
const now = new Date("2026-10-22T19:00:00Z"); // 13:00 Managua
const day = (date: string, total = 1000, closed = true): ForecastDay => ({
  date,
  closed,
  sales: [
    { at: date + "T12:00:00-06:00", total: total / 2 },
    { at: date + "T22:00:00-06:00", total: total / 2 },
  ],
});
const history = [
  day("2026-10-15"),
  day("2026-10-08"),
  day("2026-10-01"),
  day("2026-09-24"),
];
describe("proyecciones informativas", () => {
  it("pide historial suficiente en lugar de inventar ventas", () => {
    expect(forecastSales([], "2026-10-22", now).estimate).toBeNull();
    expect(forecastMonth([], now).remaining).toBeNull();
  });
  it("usa solo jornadas cerradas y anteriores, sin futuras ni abiertas", () => {
    const a = forecastSales(history, "2026-10-22", now);
    const b = forecastSales(
      [...history, day("2026-10-21", 99999, false), day("2026-10-23", 99999)],
      "2026-10-22",
      now,
    );
    expect(a.estimate).toBe(b.estimate);
    expect(b.count).toBe(4);
  });
  it("ajusta el cierre al ritmo cobrado a la misma hora y no proyecta menos de lo vendido", () => {
    const a = forecastSales(
      [...history, day("2026-10-22", 2000, false)],
      "2026-10-22",
      now,
    );
    expect(a.actual).toBe(1000);
    expect(a.estimate).toBeGreaterThan(1000);
    expect(a.lower).toBeGreaterThanOrEqual(a.actual);
    expect(a.rhythm).toBe(100);
  });
  it("una jornada cerrada muestra su resultado, sin predicción retrospectiva", () => {
    const f = forecastSales(
      [...history, day("2026-10-20", 500)],
      "2026-10-20",
      now,
    );
    expect(f.status).toBe("completed");
    expect(f.estimate).toBe(500);
  });
  it("da más peso al mismo día de la semana", () => {
    const f = forecastSales(
      [
        day("2026-10-15", 900),
        day("2026-10-14", 100),
        day("2026-10-13", 100),
        day("2026-10-12", 100),
      ],
      "2026-10-22",
      now,
    );
    expect(f.baseline).toBeGreaterThan(300);
    expect(f.similarDays).toBe(1);
  });
  it("incluye cero ventas solo si hubo jornada cerrada registrada", () => {
    const f = forecastSales(
      [day("2026-10-15", 0), day("2026-10-08", 0), day("2026-10-01", 0)],
      "2026-10-22",
      now,
    );
    expect(f.estimate).toBe(0);
    expect(f.count).toBe(3);
  });
  it("mantiene la madrugada en la jornada original", () => {
    const f = forecastSales(
      history,
      "2026-10-22",
      new Date("2026-10-23T06:15:00Z"),
    );
    expect(f.status).toBe("live");
    expect(f.estimate).not.toBeNull();
  });
  it("suma resto de hoy y días siguientes sin duplicar ventas realizadas", () => {
    const data = [...history, day("2026-10-22", 1000, false)];
    const m = forecastMonth(data, now);
    expect(m.daysRemaining).toBe(10);
    expect(m.actual).toBe(3500);
    expect(m.remaining).toBeCloseTo(9500, 0);
    expect(m.total).toBeCloseTo(m.actual + m.remaining!, 2);
    expect(m.lower).toBeLessThanOrEqual(m.total!);
    expect(m.upper).toBeGreaterThanOrEqual(m.total!);
  });
  it("el último día del mes solo proyecta lo que falta de ese día", () => {
    const time = new Date("2026-10-31T19:00:00Z");
    const data = [...history, day("2026-10-31", 1000, false)];
    const m = forecastMonth(data, time);
    expect(m.daysRemaining).toBe(1);
    expect(m.remaining).toBe(500);
  });
  it("reconoce feriados fijos y Semana Santa móvil", () => {
    expect(holiday("2026-09-15")?.key).toBe("independence");
    expect(holiday("2026-04-02")?.name).toBe("Jueves Santo");
    expect(holiday("2026-04-03")?.name).toBe("Viernes Santo");
    expect(holiday("2025-04-18")?.name).toBe("Viernes Santo");
    expect(holiday("2026-10-22")).toBeNull();
  });
  it("busca el mismo feriado hasta dos años atrás", () => {
    const t = new Date("2026-09-15T16:00:00Z");
    const days = [
      day("2025-09-15", 2500),
      day("2026-09-08"),
      day("2026-09-01"),
      day("2026-08-25"),
    ];
    const f = forecastSales(days, "2026-09-15", t);
    expect(f.holidayComparables).toBe(1);
    expect(f.count).toBe(4);
    expect(f.upper! - f.lower!).toBeGreaterThanOrEqual(f.baseline! * 0.8);
  });
  it("avisa del feriado sin imponer un aumento fijo", () => {
    const t = new Date("2026-12-25T16:00:00Z");
    const f = forecastSales(
      [day("2026-12-18"), day("2026-12-11"), day("2026-12-04")],
      "2026-12-25",
      t,
    );
    expect(f.holiday).toBe("Navidad");
    expect(f.holidayComparables).toBe(0);
    expect(f.estimate).toBe(1000);
  });
  it("enumera feriados que quedan en el mes", () => {
    const m = forecastMonth([], new Date("2026-09-01T18:00:00Z"));
    expect(m.holidays.map((h) => h.name)).toEqual([
      "Batalla de San Jacinto",
      "Día de la Independencia",
    ]);
  });
});
