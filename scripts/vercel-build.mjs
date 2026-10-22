import { spawnSync } from "node:child_process";
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run("npm", ["run", "db:generate"]);
// PostgreSQL is reachable from Vercel's build network. Prisma uses its advisory
// migration lock; failed migrations stop publication rather than serving a broken POS.
if (!process.env.DATABASE_URL)
  throw new Error("Configura DATABASE_URL antes de desplegar.");
run("npm", ["run", "db:migrate"]);
if (process.env.POS_BOOTSTRAP_DEMO === "1") {
  if (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_BILLING_PASSWORD)
    throw new Error("Faltan las contraseñas de usuarios de demostración.");
  run("npm", ["run", "db:seed"]);
  run("node", ["--import", "tsx", "scripts/prepare-pos-demo.ts"]);
}
if (process.env.POS_BOOTSTRAP_OWNER === "1") {
  if (!process.env.INITIAL_ADMIN_PASSWORD)
    throw new Error(
      "Falta INITIAL_ADMIN_PASSWORD para aprovisionar al administrador.",
    );
  run("node", ["--import", "tsx", "scripts/provision-bar.ts"]);
}
run("npm", ["run", "build"]);
