import { expect, it } from "vitest";
import {
  selectModifiers,
  modifierLabel,
  type Modifier,
} from "../lib/bar-modifiers";
const options: Modifier[] = [
  {
    key: "bathed",
    label: "Bañadas",
    kind: "OPTION",
    group: "Preparación",
    required: true,
    price: "0",
  },
  {
    key: "aside",
    label: "Salsa aparte",
    kind: "OPTION",
    group: "Preparación",
    required: true,
    price: "0",
  },
  { key: "tomato", label: "tomate", kind: "REMOVE", price: "0" },
  { key: "cheese", label: "queso", kind: "EXTRA", price: "25" },
];
it("exige una preparación y rechaza elecciones incompatibles", () => {
  expect(() => selectModifiers(options, [])).toThrow(/Elegí una/);
  expect(() => selectModifiers(options, ["bathed", "aside"])).toThrow(
    /solo una/,
  );
});
it("conserva ingredientes quitados, extras y preparación", () => {
  expect(
    selectModifiers(options, ["aside", "tomato", "cheese"]).map(modifierLabel),
  ).toEqual(["Preparación: Salsa aparte", "Sin tomate", "Extra queso"]);
});
it("rechaza opciones no configuradas o duplicadas", () => {
  expect(() => selectModifiers(options, ["fake"])).toThrow();
  expect(() => selectModifiers(options, ["bathed", "bathed"])).toThrow();
});
