import { Node } from '@xyflow/react';
import { NodeTypes, NodeData, DynamicNodeConfig, BaseNodeConfig, NodeType, NodeTypesByCategory } from './base';

interface Position {
  x: number;
  y: number;
}

export interface CustomNode extends Node<NodeData<DynamicNodeConfig>> {
  type: string;
  position: Position;
  id: string;
}

export type ReactFlowNode = CustomNode;

export type { NodeType };

export interface NodeTypeRegistry {
  [category: string]: NodeType[];
}

export interface NodeTypesResponse {
  schema: NodeTypesByCategory;
  metadata: Record<string, unknown>;
}

export type { Node as ReactFlowBaseNode };
