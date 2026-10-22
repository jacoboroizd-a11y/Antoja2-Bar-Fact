import { test, expect } from "vitest";
import { barClock } from "../lib/bar-time";
import { canBar } from "../server/bar-permissions";
test("viernes hasta sábado 00:29 sigue siendo jornada del viernes", () => {
  expect(barClock(new Date("2026-10-24T06:00:00Z"))).toEqual({
    date: "2026-10-23",
    minutes: 0,
    operating: true,
  });
  expect(barClock(new Date("2026-10-24T06:29:59Z")).date).toBe("2026-10-23");
  expect(barClock(new Date("2026-10-24T06:30:00Z"))).toEqual({
    date: "2026-10-24",
    minutes: 30,
    operating: false,
  });
  expect(barClock(new Date("2026-10-23T17:29:00Z")).operating).toBe(false);
  expect(barClock(new Date("2026-10-23T17:30:00Z")).operating).toBe(true);
});
test("roles de bar tienen capacidades específicas", () => {
  expect(canBar("WAITER", "cash")).toBe(false);
  expect(canBar("WAITER", "orders")).toBe(true);
  expect(canBar("KITCHEN", "kitchen")).toBe(true);
  expect(canBar("KITCHEN", "catalog")).toBe(false);
  expect(canBar("CASHIER", "cash")).toBe(true);
  expect(canBar("CASHIER", "catalog")).toBe(false);
  expect(canBar("MANAGER", "adjustClose")).toBe(false);
  expect(canBar("VIEWER", "orders")).toBe(false);
});

import { barPeriod } from "../lib/bar-period";
test("períodos mensuales y diarios respetan fin de mes y año bisiesto", () => {
  expect(barPeriod("month", "2026-12").end.toISOString()).toBe(
    "2027-01-01T00:00:00.000Z",
  );
  expect(barPeriod("day", "2028-02-29").end.toISOString()).toBe(
    "2028-03-01T00:00:00.000Z",
  );
  expect(() => barPeriod("day", "2026-02-29")).toThrow();
  expect(() => barPeriod("month", "2026-13")).toThrow();
});
