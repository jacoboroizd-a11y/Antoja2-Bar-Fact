export const barPermissions = {
  read: ["ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "VIEWER"],
  orders: ["ADMIN", "MANAGER", "CASHIER", "WAITER"],
  cash: ["ADMIN", "MANAGER", "CASHIER"],
  catalog: ["ADMIN", "MANAGER"],
  reports: ["ADMIN", "MANAGER", "VIEWER"],
  kitchen: ["ADMIN", "MANAGER", "KITCHEN"],
  adjustClose: ["ADMIN"],
} as const;
export type BarPermission = keyof typeof barPermissions;
export function canBar(role: string, permission: BarPermission) {
  return (barPermissions[permission] as readonly string[]).includes(role);
}
