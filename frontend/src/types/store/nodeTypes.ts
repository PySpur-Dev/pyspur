import { NodeType } from '../nodes/base';

export type NodeTypesByCategory = Record<string, NodeType[]>;
export type NodeTypesConfig = NodeTypesByCategory;

export interface NodeTypeRegistry {
  [key: string]: NodeType;
}

export function convertNodeTypesToRegistry(nodeTypes: NodeTypesByCategory): NodeTypeRegistry {
  return Object.entries(nodeTypes).reduce((acc, [_, types]) => {
    types.forEach(type => {
      acc[type.name] = type;
    });
    return acc;
  }, {} as NodeTypeRegistry);
}
