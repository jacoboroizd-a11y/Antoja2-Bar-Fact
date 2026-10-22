import { AppError, type Context } from "./auth";
import { canBar, type BarPermission } from "@/lib/bar-permissions";
export { canBar } from "@/lib/bar-permissions";
export function requireBar(ctx: Context, permission: BarPermission) {
  if (!canBar(ctx.role, permission))
    throw new AppError("No tienes permiso para esta operación.", 403);
}
