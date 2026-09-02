import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-foreground",
          "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-zinc-400",
          "transition-[border-color,box-shadow] duration-150",
          "hover:border-zinc-400",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15",
          "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 disabled:opacity-70",
          "dark:bg-zinc-950 dark:border-zinc-700 dark:placeholder:text-zinc-500 dark:hover:border-zinc-500 dark:disabled:bg-zinc-900",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
