import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { hash } from "bcryptjs";
import { db } from "../server/db";
async function main() {
  const companyId = "antoja2";
  if (await db.company.findUnique({ where: { id: companyId } })) {
    console.log("Empresa y administrador originales existentes: preservados.");
    return;
  }
  const password =
    process.env.INITIAL_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72)
    throw new Error("INITIAL_ADMIN_PASSWORD debe tener entre 12 y 72 bytes.");
  if (await db.user.findUnique({ where: { username: "admin" } }))
    throw new Error(
      "El usuario admin ya existe. Revisa la membresía antes de aprovisionar.",
    );
  await db.$transaction(async (tx) => {
    await tx.company.create({
      data: {
        id: companyId,
        name: "Antoja2 Bar & Restaurante",
        tradeName: "Antoja2",
        address: "Managua, Nicaragua",
        settings: { create: { terms: "Gracias por tu visita." } },
      },
    });
    const user = await tx.user.create({
      data: {
        username: "admin",
        name: "Administrador principal",
        passwordHash: await hash(password, 12),
        memberships: { create: { companyId, role: "ADMIN" } },
      },
    });
    await tx.auditLog.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "OWNER_PROVISIONED",
        metadata: { role: "ADMIN" },
      },
    });
    for (const [kind, names] of [
      [
        "DRINK",
        [
          "Bebidas alcohólicas",
          "Bebidas no alcohólicas",
          "Cervezas",
          "Licores",
          "Vinos",
          "Mixers",
          "Agua",
          "Gaseosas",
          "Jugos",
          "Otros",
        ],
      ],
      [
        "FOOD",
        [
          "Entradas",
          "Platos fuertes",
          "Hamburguesas",
          "Tacos",
          "Acompañamientos",
          "Postres",
          "Extras",
        ],
      ],
      ["COMBO", ["Promociones"]],
    ] as const)
      for (const name of names)
        await tx.barCategory.create({ data: { companyId, kind, name } });
    for (let i = 1; i <= 12; i++)
      await tx.diningTable.create({
        data: {
          companyId,
          name: "Mesa " + String(i).padStart(2, "0"),
          seats: 4,
        },
      });
  });
  if (process.env.VERCEL !== "1") {
    await mkdir("/workspace/.cloud", { recursive: true, mode: 0o700 });
    await writeFile(
      "/workspace/.cloud/Antoja2-acceso.txt",
      `Antoja2 POS — Acceso del administrador principal\n\nUsuario: admin\nContraseña inicial: ${password}\nRol: ADMIN\nEmpresa: Antoja2 Bar & Restaurante\n\nAcceso creado en este entorno de desarrollo. No está publicado en Vercel.\nIngresá desde /login del despliegue de Antoja2 cuando se publique.\nLa web de la clínica no se modificó.\nCambiá tu contraseña desde Configuración > Mi contraseña.\nConservá este archivo de forma privada; no lo subas al repositorio.\n`,
      { mode: 0o600, flag: "wx" },
    );
  }
  console.log(
    "Administrador principal aprovisionado. Usuario: admin. Contraseña no mostrada.",
  );
}
main()
  .catch((e) => {
    console.error(
      e instanceof Error ? e.message : "Error de aprovisionamiento",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
