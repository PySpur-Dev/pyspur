import { Node, Edge, XYPosition, Position, ReactFlowInstance as BaseReactFlowInstance, Connection as BaseConnection } from '@xyflow/react';
import { WorkflowNode } from './nodes/base';
import { BaseNodeConfig, DynamicNodeConfig } from './nodes/base';
import { NodeTypes, NodeData } from './nodes/base';

export type ReactFlowNode = Node<NodeData & {
  config: BaseNodeConfig;
  [key: string]: unknown;
}> & {
  key?: string;
  type: string;  // Required field
  node_type?: string;
  config?: DynamicNodeConfig;
};

export interface CustomEdge extends Edge {
  key: string;
  data?: {
    sourceNode?: ReactFlowNode;
    targetNode?: ReactFlowNode;
    showPlusButton?: boolean;
    onPopoverOpen?: (params: {
      sourceNode: ReactFlowNode;
      targetNode: ReactFlowNode;
      edgeId: string;
    }) => void;
  };
}

export type Connection = BaseConnection & Partial<Edge> & {
  data?: {
    source_output_key?: string;
    target_input_key?: string;
    source_output_type?: string;
    target_input_type?: string;
    [key: string]: unknown;
  };
};

export type ReactFlowInstance = BaseReactFlowInstance<ReactFlowNode, CustomEdge>;

export const workflowToReactFlowNode = (node: WorkflowNode<DynamicNodeConfig>): ReactFlowNode => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data,
  draggable: true,
  selectable: true,
});

export const reactFlowToWorkflowNode = (node: ReactFlowNode): WorkflowNode<DynamicNodeConfig> => ({
  id: node.id,
  type: node.type || 'dynamic',
  position: node.position,
  data: node.data,
});
