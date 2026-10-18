import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type, ...props }, ref) {
    return <input
      type={type} ref={ref}
      className={cn("flex h-12 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 disabled:opacity-50", className)}
      {...props}
    />;
  }
);
