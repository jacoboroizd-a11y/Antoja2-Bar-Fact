import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-[#e7d6dc] bg-white/85 px-3.5 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400 focus:border-brand-600 focus:ring-3 focus:ring-brand-100 disabled:bg-slate-50",
        className,
      )}
      {...props}
    />
  );
}
