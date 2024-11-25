import { Edge } from "@/types";
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";

export function CustomEdge({ ...props }: EdgeProps<Edge>) {
  const reactFlowInstance = useReactFlow();
  const sourceNode = reactFlowInstance.getNode(props.source);
  const targetNode = reactFlowInstance.getNode(props.target);
  const [edgePath] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
  });

  return <BaseEdge path={edgePath} markerEnd={props.markerEnd} {...props} />;
}
