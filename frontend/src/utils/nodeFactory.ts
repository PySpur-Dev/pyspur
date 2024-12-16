import { Node as FlowNode } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { NodeTypes, NodeType, NodeData, BaseNodeConfig, WorkflowNode, findNodeSchema, NODE_TYPES } from '../types/nodes/base';

// Convert string node type to node type constant
export const getNodeType = (type: string): string => {
  const nodeType = type.toLowerCase();
  switch (nodeType) {
    case 'input':
      return NODE_TYPES.INPUT;
    case 'output':
    case 'output_display':
      return NODE_TYPES.OUTPUT_DISPLAY;
    case 'dynamic':
      return NODE_TYPES.DYNAMIC;
    case 'if_else':
      return NODE_TYPES.IF_ELSE;
    case 'merge':
      return NODE_TYPES.MERGE;
    case 'loop':
      return NODE_TYPES.LOOP;
    default:
      return nodeType; // Return the original type if no match found
  }
};

export const createNode = (
  nodeTypes: Record<string, NodeType[]>,
  nodeType: string,
  id: string = uuidv4(),
  position: { x: number; y: number } = { x: 100, y: 100 },
  data: Partial<NodeData> = {}
): WorkflowNode | null => {
  // Convert string type to node type constant if needed
  const enumNodeType = typeof nodeType === 'string' ? getNodeType(nodeType) : nodeType;
  console.log('Creating node with type:', enumNodeType);

  // Find the node schema from nodeTypes
  const schema = findNodeSchema(enumNodeType.toString(), nodeTypes);
  console.log('Looking for schema:', {
    searchType: enumNodeType.toString(),
    availableTypes: nodeTypes,
    foundSchema: schema
  });

  if (!schema) {
    console.error('Node schema not found. Available types:',
      Object.entries(nodeTypes).map(([category, types]) =>
        `${category}: [${types.map(t => `${t.type} (${t.name})`).join(', ')}]`
      ).join('\n')
    );
    return null;
  }

  const defaultConfig: BaseNodeConfig = {
    title: data.title || schema.name || 'New Node',
    input_schema: data.config?.input_schema || schema.input?.properties || {},
    output_schema: data.config?.output_schema || schema.output?.properties || {},
    ...data.config
  };

  const nodeData: NodeData = {
    title: data.title || defaultConfig.title,
    color: data.color || schema.visual_tag?.color,
    acronym: data.acronym || schema.visual_tag?.acronym,
    config: defaultConfig,
    run: data.run,
    status: data.status
  };

  return {
    id,
    type: enumNodeType,
    position,
    data: nodeData,
    draggable: true,
    selectable: true,
    connectable: true,
  };
};
