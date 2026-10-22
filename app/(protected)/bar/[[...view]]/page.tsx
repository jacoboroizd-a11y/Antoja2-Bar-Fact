import { PosTerminal } from "@/components/pos-terminal";
import { BarReports } from "@/components/bar-reports";
import { barReport } from "@/server/bar-report";
import { requireBar } from "@/server/bar-permissions";
import { notFound, redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
import { barSnapshot } from "@/server/bar";
import { BarWorkspace } from "@/components/bar-workspace";
export default async function BarPage({
  params,
  searchParams,
}: {
  params: Promise<{ view?: string[] }>;
  searchParams: Promise<{ kind?: string; period?: string; tab?: string }>;
}) {
  const ctx = await pageContext();
  const { view = [] } = await params;
  if (
    view.length > 1 ||
    (view[0] &&
      ![
        "menu",
        "pos",
        "tables",
        "orders",
        "kitchen",
        "cash",
        "drinks",
        "food",
        "combos",
        "categories",
        "warehouse",
        "ingredients",
        "inventory",
        "movements",
        "suppliers",
        "reports",
      ].includes(view[0]))
  )
    notFound();
  if (
    ctx.role === "WAITER" &&
    !["pos", "tables", "orders"].includes(view[0] || "pos")
  )
    notFound();
  if (
    ctx.role === "CASHIER" &&
    !["pos", "tables", "orders", "cash"].includes(view[0] || "pos")
  )
    notFound();
  if (ctx.role === "KITCHEN" && view[0] !== "kitchen") notFound();
  if (view[0] === "reports") requireBar(ctx, "reports");
  if (view[0] === "reports") {
    const filters = await searchParams;
    return (
      <BarReports
        key={(filters.kind || "day") + (filters.period || "")}
        report={await barReport(
          ctx,
          filters.kind === "month" ? "month" : "day",
          filters.period,
        )}
      />
    );
  }
  if (["drinks", "food", "combos", "categories"].includes(view[0] || ""))
    redirect(`/bar/menu?tab=${view[0]}`);
  if (view[0] === "movements") redirect("/bar/inventory?tab=movements");
  if (view[0] === "suppliers") redirect("/bar/cash");
  const filters = await searchParams;
  const section = view[0] || "dashboard";
  const menuTabs = ["drinks", "food", "combos", "categories"];
  const inventoryTabs = ["inventory", "movements", "ingredients", "warehouse"];
  const resolvedView =
    section === "menu"
      ? menuTabs.includes(filters.tab || "")
        ? filters.tab!
        : "food"
      : section === "inventory" && filters.tab === "movements"
        ? "movements"
        : section;
  const group =
    section === "menu" || menuTabs.includes(section)
      ? "menu"
      : inventoryTabs.includes(section)
        ? "inventory"
        : undefined;
  const snapshot = await barSnapshot(ctx, section === "dashboard");
  if (view[0] === "pos")
    return <PosTerminal ctx={ctx} s={JSON.parse(JSON.stringify(snapshot))} />;
  return (
    <BarWorkspace
      ctx={ctx}
      initial={JSON.parse(JSON.stringify(snapshot))}
      view={resolvedView}
      section={group}
    />
  );
}
