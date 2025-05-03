// components/ui/Spinner.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const spinnerStyles = cva(
  "inline-block animate-spin rounded-full border-current border-2 border-t-transparent",
  {
    variants: {
      size: {
        xs: "w-3 h-3 border-2",
        sm: "w-4 h-4 border-2",
        md: "w-6 h-6 border-4",
        lg: "w-8 h-8 border-4",
        xl: "w-12 h-12 border-6",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerStyles> {}

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ size, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        role="status"
        aria-label="Loading…"
        className={cn(spinnerStyles({ size }), className)}
        {...props}
      />
    );
  }
);
Spinner.displayName = "Spinner";
