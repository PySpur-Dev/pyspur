import { Node } from '@xyflow/react';

export interface NodeData {
  title?: string;
  config?: {
    title?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface FlowNode extends Node<NodeData> {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
  };
  data: NodeData;
}

export const validatePythonVarName = (name: string): boolean => {
  const pythonVarRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return pythonVarRegex.test(name);
};

export const sanitizePythonVarName = (name: string): string => {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^\d/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  if (!sanitized || sanitized === '_') {
    sanitized = 'node';
  }
  return sanitized;
};

export const getUniqueNodeTitle = (
  desiredTitle: string,
  existingNodes: FlowNode[]
): string => {
  let sanitizedTitle = sanitizePythonVarName(desiredTitle);

  const existingTitles = new Set(
    existingNodes.map(node =>
      node.data?.config?.title || node.data?.title || ''
    )
  );

  if (!existingTitles.has(sanitizedTitle)) {
    return sanitizedTitle;
  }

  let counter = 1;
  let newTitle = `${sanitizedTitle}_${counter}`;
  while (existingTitles.has(newTitle)) {
    counter++;
    newTitle = `${sanitizedTitle}_${counter}`;
  }

  return newTitle;
};
