import { context, checkOrigin, AppError } from "@/server/auth";
import { barCommand } from "@/server/bar";
import { Prisma } from "@prisma/client";
import { z } from "zod";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(request);
    const ctx = await context();
    return Response.json(
      await barCommand(ctx, (await params).action, await request.json()),
    );
  } catch (error) {
    if (error instanceof AppError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return Response.json(
        {
          error:
            "El registro ya existe. Actualiza la vista antes de reintentar.",
        },
        { status: 409 },
      );
    console.error(
      error instanceof Error ? error.message : "Bar command failed",
    );
    return Response.json(
      { error: "No se pudo completar la operación." },
      { status: 500 },
    );
  }
}
