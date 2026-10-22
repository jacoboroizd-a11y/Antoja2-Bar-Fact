// Nicaragua is UTC-6 throughout the year. At 00:30 the prior shift has ended.
export function barClock(now = new Date()) {
  const local = new Date(now.getTime() - 6 * 3600000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const date = new Date(local);
  if (minutes < 30) date.setUTCDate(date.getUTCDate() - 1);
  return {
    date: date.toISOString().slice(0, 10),
    minutes,
    operating: minutes >= 690 || minutes < 30,
  };
}
