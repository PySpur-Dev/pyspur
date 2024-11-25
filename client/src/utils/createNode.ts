import { WorkflowNodeSchema } from "@/api/generated";
import { LLMNode, Node, PrimitiveNode, PythonNode } from "@/types";

export function createNode(
  node: WorkflowNodeSchema,
  nodeSupportedTypes: {
    [id: string]: LLMNode | PrimitiveNode | PythonNode;
  },
  additionalData: Record<string, any> = {}
): Node {
  const nodeType = nodeSupportedTypes[node.node_type];

  return {
    id: node.id,
    position: { x: node.coordinates?.x ?? 0, y: node.coordinates?.y ?? 0 },
    data: {
      title: node.title ?? "",
      acronym: nodeType?.visual_tag?.acronym ?? "",
      color: nodeType?.visual_tag?.color ?? "",
      input: {
        properties: nodeType?.input?.properties ?? {},
        ...(additionalData.input?.properties ?? {}),
      },
      output: {
        properties: nodeType?.output?.properties ?? {},
        ...(additionalData.output?.properties ?? {}),
      },
      config: node.config ?? {},
    },
    type: node.node_type,
  };
}
