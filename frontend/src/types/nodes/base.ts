import { Node as FlowNode } from '@xyflow/react';
import { CSSProperties, ReactNode } from 'react';

export interface NodeCoordinates {
  x: number;
  y: number;
}

export interface BaseNodeConfig {
  title?: string;
  input_schema?: Record<string, string>;
  output_schema?: Record<string, string>;
  [key: string]: unknown;
}

export interface BaseNodeData extends Record<string, unknown> {
  title?: string;
  color?: string;
  acronym?: string;
  config?: BaseNodeConfig;
  run?: Record<string, unknown>;
  status?: string;
}

export interface BaseNodeProps {
  id: string;
  data: BaseNodeData;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  handleOpenModal?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
  isInputNode?: boolean;
  className?: string;
}

export type WorkflowNode = FlowNode<BaseNodeData>;
