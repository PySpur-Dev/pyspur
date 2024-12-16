import { useMemo } from 'react';
import { NodeTypes } from '@xyflow/react';
import { NodeTypeRegistry } from '../types/nodes/custom';
import { ComponentType } from 'react';

export interface UseNodeTypesProps {
  nodeTypesConfig: NodeTypeRegistry;
}

export const useNodeTypes = ({ nodeTypesConfig }: UseNodeTypesProps) => {
  const nodeTypes = useMemo<NodeTypes>(() => {
    const types: Record<string, ComponentType<any>> = {};

    if (!nodeTypesConfig) return types;

    Object.entries(nodeTypesConfig).forEach(([category, nodes]) => {
      nodes.forEach((node) => {
        types[node.name] = DynamicNode;
      });
    });

    return types;
  }, [nodeTypesConfig]);

  return {
    nodeTypes,
    isLoading: false,
  };
};

import DynamicNode from '../components/nodes/DynamicNode';
