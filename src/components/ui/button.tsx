import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const styles = cva(
  "inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-[#0d583e]",
        dark: "bg-ink text-white hover:bg-[#264439]",
        outline: "border border-line bg-white text-ink hover:bg-canvas",
        ghost: "bg-transparent text-ink hover:bg-canvas",
        lime: "bg-lime text-ink hover:bg-[#c9e65d]"
      },
      size: { sm: "h-10 px-4", md: "h-12 px-5", lg: "h-14 px-6 text-base", icon: "h-11 w-11" }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof styles> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props }, ref
) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(styles({ variant, size }), className)} ref={ref} {...props} />;
});
