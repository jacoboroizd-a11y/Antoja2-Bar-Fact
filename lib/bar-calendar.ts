// Statutory national holidays in Nicaragua. Local patron-saint festivities and
// exceptional government decrees require an explicit calendar update.
export function holiday(date: string): { key: string; name: string } | null {
  const fixed: Record<string, [string, string]> = {
    "01-01": ["new-year", "Año Nuevo"],
    "05-01": ["labour", "Día del Trabajo"],
    "07-19": ["revolution", "Día de la Revolución"],
    "09-14": ["san-jacinto", "Batalla de San Jacinto"],
    "09-15": ["independence", "Día de la Independencia"],
    "12-08": ["conception", "Inmaculada Concepción"],
    "12-25": ["christmas", "Navidad"],
  };
  const match = fixed[date.slice(5)];
  if (match) return { key: match[0], name: match[1] };
  // Gregorian computus, with Thursday/Friday measured in UTC calendar dates.
  const y = Number(date.slice(0, 4)),
    a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = Date.UTC(y, month - 1, day);
  const t = Date.parse(date + "T00:00:00Z");
  return t === easter - 3 * 86400000
    ? { key: "holy-thursday", name: "Jueves Santo" }
    : t === easter - 2 * 86400000
      ? { key: "good-friday", name: "Viernes Santo" }
      : null;
}
export function payPeriod(date: string) {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return day >= 14 && day <= 16
    ? "midmonth"
    : day <= 2 || day >= last - 1
      ? "month-end"
      : "regular";
}
