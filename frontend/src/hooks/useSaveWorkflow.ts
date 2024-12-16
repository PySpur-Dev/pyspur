import { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Edge } from '@xyflow/react';
import { updateWorkflow } from '../utils/api';
import { RootState } from '../store/store';
import { WorkflowNode, NodeData, DynamicNodeConfig } from '../types/nodes/base';
import { WorkflowDefinition } from '../types/workflow';
import { CustomEdge } from '../types/reactflow';

interface Position {
  x: number;
  y: number;
}

export const useSaveWorkflow = (trigger: unknown, delay: number = 2000) => {
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const edges = useSelector((state: RootState) => state.flow.edges);
  const workflowId = useSelector((state: RootState) => state.flow.workflowId);
  const workflowInputVariables = useSelector((state: RootState) => state.flow.workflowInputVariables);
  const workflowName = useSelector((state: RootState) => state.flow.projectName);
  const testInputs = useSelector((state: RootState) => state.flow.testInputs);

  const saveWorkflow = useCallback(async () => {
    if (!workflowId) {
      console.warn('No workflow ID available');
      return;
    }

    try {
      const updatedNodes = nodes
        .filter((node): node is WorkflowNode<DynamicNodeConfig> => node !== null && node !== undefined)
        .map((node) => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: {
            config: (node.data as NodeData<DynamicNodeConfig>).config,
            title: (node.data as NodeData<DynamicNodeConfig>).title
          }
        }));

      const updatedEdges = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || '',
        targetHandle: edge.targetHandle || '',
        data: edge.data || {},
        key: edge.id
      })) as CustomEdge[];

      const updatedWorkflow: WorkflowDefinition = {
        nodes: updatedNodes,
        edges: updatedEdges,
        test_inputs: Array.isArray(testInputs) ? testInputs : []
      };

      console.log('send to b/e workflow:', updatedWorkflow);
      await updateWorkflow(workflowId, updatedWorkflow);
    } catch (error) {
      console.error('Error saving workflow:', error);
    }
  }, [workflowId, nodes, edges, workflowInputVariables, workflowName, testInputs]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (nodes.length > 0 || edges.length > 0) {
        saveWorkflow();
      }
    }, delay);

    return () => clearTimeout(handle);
  }, [nodes, edges, saveWorkflow, trigger, delay]);

  return saveWorkflow;
};
