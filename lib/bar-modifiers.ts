export type Modifier = {
  key: string;
  label: string;
  kind: string;
  price: string;
  group?: string;
  required?: boolean;
};
export function modifierLabel(c: Modifier) {
  return c.kind === "REMOVE"
    ? "Sin " + c.label
    : c.kind === "EXTRA"
      ? "Extra " + c.label
      : (c.group || "Preparación") + ": " + c.label;
}
export function selectModifiers(options: Modifier[], keys: string[]) {
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key) => !options.some((c) => c.key === key))
  )
    throw Error("Opciones del menú no válidas.");
  const selected = options.filter((c) => keys.includes(c.key));
  const groups = [
    ...new Set(
      options
        .filter((c) => c.kind === "OPTION")
        .map((c) => c.group || "Preparación"),
    ),
  ];
  for (const group of groups) {
    const rows = options.filter(
      (c) => c.kind === "OPTION" && (c.group || "Preparación") === group,
    );
    const count = rows.filter((c) => keys.includes(c.key)).length;
    if (count > 1) throw Error("Elegí solo una opción de " + group + ".");
    if (rows.some((c) => c.required) && !count)
      throw Error("Elegí una opción de " + group + ".");
  }
  return selected;
}
