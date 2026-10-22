import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
export default async function Home() {
  const ctx = await pageContext();
  redirect(
    ctx.role === "KITCHEN"
      ? "/bar/kitchen"
      : ctx.role === "ACCOUNTANT"
        ? "/accounting"
        : ["WAITER", "CASHIER"].includes(ctx.role)
          ? "/bar/pos"
          : ctx.role === "BILLING"
            ? "/sales"
            : "/bar",
  );
}
