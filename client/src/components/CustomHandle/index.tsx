import { Handle, HandleProps, Position } from "@xyflow/react";
import { cn } from "@/utils";

export function CustomHandle({
  type,
  className,
  ...props
}: Omit<HandleProps, "position">) {
  return (
    <Handle
      type={type}
      position={type === "target" ? Position.Left : Position.Right}
      className={cn(
        "!relative !transform-none !top-0 !left-0 !w-2 !h-2 !border-2",
        className
      )}
      {...props}
    />
  );
}
