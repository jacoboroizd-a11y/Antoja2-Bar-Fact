import { db } from "@/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", application: "Antoja2 POS", database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable", application: "Antoja2 POS" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
