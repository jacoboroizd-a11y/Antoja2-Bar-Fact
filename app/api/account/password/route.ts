import { context, checkOrigin, AppError } from "@/server/auth";
import { db } from "@/server/db";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context();
    const data = z
      .object({
        current: z.string().min(1).max(72),
        password: z
          .string()
          .min(12)
          .max(72)
          .refine((v) => Buffer.byteLength(v, "utf8") <= 72),
      })
      .parse(await request.json());
    const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!(await compare(data.current, user.passwordHash)))
      throw new AppError("La contraseña actual no es correcta.", 403);
    if (data.current === data.password)
      throw new AppError("Elegí una contraseña diferente.");
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: ctx.userId },
        data: { passwordHash: await hash(data.password, 12) },
      });
      await tx.session.deleteMany({ where: { userId: ctx.userId } });
      await tx.auditLog.create({
        data: {
          userId: ctx.userId,
          companyId: ctx.companyId,
          entityType: "User",
          entityId: ctx.userId,
          action: "PASSWORD_CHANGED",
          metadata: { sessionsRevoked: true },
        },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : e instanceof z.ZodError
              ? "Usá una contraseña de 12 a 72 caracteres."
              : "No se pudo cambiar la contraseña.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
