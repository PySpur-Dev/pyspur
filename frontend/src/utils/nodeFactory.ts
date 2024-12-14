import { Node as FlowNode } from '@xyflow/react';
import cloneDeep from 'lodash/cloneDeep';
import { NodeTypes, NodeType, BaseNodeData, WorkflowNode } from '../types/nodes/base';

interface Position {
  x: number;
  y: number;
}

interface AdditionalData {
  config?: Record<string, unknown>;
  input?: {
    properties: Record<string, unknown>;
  };
  output?: {
    properties: Record<string, unknown>;
  };
}

export function createNode(
  nodeTypes: NodeTypes,
  nodeType: string,
  id: string,
  position: Position,
  additionalData: AdditionalData = {}
): WorkflowNode | null {
  const category = Object.keys(nodeTypes).find(cat =>
    nodeTypes[cat].some(type => type.name === nodeType)
  );

  if (!category) {
    console.error(`Node type ${nodeType} not found in any category`);
    return null;
  }

  const nodeTypeData = nodeTypes[category].find(type => type.name === nodeType);
  if (!nodeTypeData) {
    console.error(`Node type ${nodeType} not found in category ${category}`);
    return null;
  }

  const processedAdditionalData = cloneDeep(additionalData);

  if (!processedAdditionalData.input) {
    processedAdditionalData.input = {
      properties: {}
    };
  }

  if (!processedAdditionalData.output) {
    processedAdditionalData.output = {
      properties: {}
    };
  }

  const node: WorkflowNode = {
    id,
    type: nodeType,
    position,
    data: {
      title: nodeTypeData.name,
      acronym: nodeTypeData.visual_tag.acronym,
      color: nodeTypeData.visual_tag.color,
      config: processedAdditionalData.config || {},
      input: processedAdditionalData.input,
      output: processedAdditionalData.output,
    },
  };

  return node;
}
