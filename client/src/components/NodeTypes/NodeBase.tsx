import { Node } from "@/types";
import { cn } from "@/utils";
import { Badge, Card, CardBody, CardHeader } from "@nextui-org/react";
import { NodeProps } from "@xyflow/react";
import { PropsWithChildren } from "react";

interface NodeBaseProps extends NodeProps<Node> {
  defaultTitle?: string;
  className?: string;
}

export function NodeBase({
  defaultTitle = "",
  data,
  children,
  className,
  ...props
}: PropsWithChildren<NodeBaseProps>) {
  return (
    <Card className={cn("flex flex-col w-52 bg-white rounded-xl border border-solid border-gray-600 overflow-visible", props.selected && "outline-dashed outline-2 outline-offset-8", className)}>
      <Badge
        content={data.acronym}
        placement="top-left"
        size="lg"
        style={{ backgroundColor: data.color, color: "white" }}
      >
        <CardHeader className="flex items-start gap-3">
          <p className="flex-1 font-semibold">{data.title || defaultTitle}</p>
        </CardHeader>
      </Badge>
      <CardBody className="overflow-visible px-0">{children}</CardBody>
    </Card>
  );
}
