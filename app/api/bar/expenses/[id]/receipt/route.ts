import { context } from "@/server/auth";
import { db } from "@/server/db";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await context();
  if (!["ADMIN", "MANAGER", "CASHIER", "VIEWER"].includes(ctx.role))
    return new Response("Acceso restringido", { status: 403 });
  const { id } = await params;
  const row = await db.barExpense.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { attachment: true },
  });
  if (!row?.attachment)
    return new Response(
      "Esta compra o gasto no tiene un comprobante adjunto.",
      { status: 404 },
    );
  const match =
    /^data:(application\/pdf|image\/png|image\/jpeg);base64,(.+)$/.exec(
      row.attachment,
    );
  if (!match) return new Response("Comprobante no disponible", { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Content-Disposition": `inline; filename="comprobante.${match[1] === "application/pdf" ? "pdf" : match[1] === "image/png" ? "png" : "jpg"}"`,
    },
  });
}
