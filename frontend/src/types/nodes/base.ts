import { Node, NodeProps as FlowNodeProps, XYPosition } from '@xyflow/react';
import { CSSProperties, ReactNode } from 'react';

// Node type constants
export const NODE_TYPES = {
  INPUT: 'input',
  OUTPUT: 'output',
  DYNAMIC: 'dynamic',
  IF_ELSE: 'if_else',
  MERGE: 'merge',
  OUTPUT_DISPLAY: 'output_display',
  LOOP: 'loop'
} as const;

export interface NodeCoordinates extends XYPosition {
  x: number;
  y: number;
}

export interface VisualTag {
  color: string;
  acronym: string;
  icon?: string;
}

export interface BaseNodeConfig {
  title?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  few_shot_examples?: Array<Record<string, string>>;
  [key: string]: unknown;
}

export interface DynamicNodeConfig extends BaseNodeConfig {
  branches?: Array<{
    conditions: Array<{
      variable: string;
      operator: string;
      value: string;
      logicalOperator?: "AND" | "OR";
    }>;
  }>;
  branch_refs?: string[];
  input_schemas?: Record<string, unknown>;
  system_message?: string;
  user_message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface NodeData<T extends BaseNodeConfig = DynamicNodeConfig> {
  config: T;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status?: string;
  title?: string;
  color?: string;
  acronym?: string;
  run?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BaseNodeProps<T extends BaseNodeConfig = DynamicNodeConfig> extends FlowNodeProps {
  data: NodeData<T>;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
  handleOpenModal?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
  isInputNode?: boolean;
  className?: string;
}

export interface NodeType {
  name: string;
  type: string;
  visual_tag: VisualTag;
  config: BaseNodeConfig;
  input?: {
    properties?: Record<string, unknown>;
  };
  output?: {
    properties?: Record<string, unknown>;
  };
}

export type NodeTypesByCategory = Record<string, NodeType[]>;
export type NodeTypes = NodeTypesByCategory;

export interface FieldMetadata {
  title?: string;
  type?: string;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  default?: string | number | boolean;
  [key: string]: unknown;
}

export interface NodeSchema extends NodeType {
  config: Record<string, FieldMetadata | Record<string, unknown>>;
}

export interface WorkflowNode<T extends BaseNodeConfig = DynamicNodeConfig> extends Node {
  type: string;
  node_type?: string;
  data: NodeData<T>;
  position: XYPosition;
  id: string;
  selected?: boolean;
  config?: T;
}

export const findNodeSchema = (
  nodeType: string,
  metadata: NodeTypes | Record<string, NodeType[]>
): NodeType | undefined => {
  for (const category in metadata) {
    const node = metadata[category]?.find(n =>
      n.type.toLowerCase() === nodeType.toLowerCase() ||
      n.name.toLowerCase() === nodeType.toLowerCase()
    );
    if (node) return node;
  }
  return undefined;
};

// Helper function to get first node type from category
export const getFirstNodeType = (nodeTypes: NodeTypes, type: string): NodeType => {
  const nodeTypeArray = nodeTypes[type];
  return Array.isArray(nodeTypeArray) && nodeTypeArray.length > 0 ? nodeTypeArray[0] : nodeTypes['dynamic'][0];
};
