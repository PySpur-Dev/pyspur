import { Node, ReactFlowInstance } from '@xyflow/react';
import { NodeType } from '../types/nodes/base';
import { ReactFlowNode } from '../types/reactflow';
import { Dispatch } from '@reduxjs/toolkit';
import { addNode, deleteEdge } from '../store/flowSlice';

export const addNodeBetweenNodes = (
  nodeTypesConfig: Record<string, NodeType[]>,
  nodeName: string,
  sourceNode: Node,
  targetNode: Node,
  edgeId: string,
  reactFlowInstance: ReactFlowInstance | null,
  dispatch: Dispatch,
  setPopoverContentVisible: (visible: boolean) => void
) => {
  if (!reactFlowInstance) return;

  // Find the node type configuration
  const nodeType = Object.values(nodeTypesConfig)
    .flat()
    .find((type) => type.name === nodeName);

  if (!nodeType) return;

  // Calculate the position between source and target nodes
  const sourcePos = sourceNode.position;
  const targetPos = targetNode.position;
  const newPosition = {
    x: (sourcePos.x + targetPos.x) / 2,
    y: (sourcePos.y + targetPos.y) / 2,
  };

  // Create the new node
  const newNode: ReactFlowNode = {
    id: `${nodeName}-${Date.now()}`,
    type: nodeName,
    position: newPosition,
    data: {
      title: nodeType.name,
      config: nodeType.config,
    },
  };

  // Add the new node and remove the old edge
  dispatch(addNode({ node: newNode }));
  dispatch(deleteEdge({ edgeId }));

  // Close the popover
  setPopoverContentVisible(false);
};
