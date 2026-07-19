"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Prevent accidental duplicate purchase submissions while the action runs. */
export function PurchaseSubmitButton({
  children,
  disabled = false,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type" | "disabled" | "aria-disabled"> & {
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const unavailable = disabled || pending;
  return (
    <Button
      type="submit"
      size={props.size ?? "sm"}
      variant={props.variant ?? "brand"}
      {...props}
      disabled={unavailable}
      aria-disabled={unavailable}
      className={cn("disabled:cursor-wait disabled:opacity-60", props.className)}
    >
      {children}
    </Button>
  );
}
