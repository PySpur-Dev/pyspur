import { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { updateWorkflow } from '../utils/api';

export const useSaveWorkflow = (trigger, delay = 2000) => {
  const nodes = useSelector(state => state.flow.nodes);
  const edges = useSelector(state => state.flow.edges);
  const workflowID = useSelector(state => state.flow.workflowID);
  const workflowInputVariables = useSelector(state => state.flow.workflowInputVariables);

  const saveWorkflow = useCallback(async () => {
    try {

      const updatedNodes = nodes.map(node => {
        if (node.type === 'InputNode') {
          return {
            ...node,
            config: {
              ...node.data.config,
              input_schema: Object.fromEntries(
                Object.keys(workflowInputVariables).map(key => [key, "str"])
              )
            }
          };
        }
        else {
          return {
            ...node,
            config: node.data?.config,
            title: node.data?.title
          }
        }
      });

      const updatedWorkflow = {
        nodes: updatedNodes.map(node => ({
          id: node.id,
          node_type: node.type,
          config: node.config,
          coordinates: node.position,
        })),
        links: edges.map(edge => {
          const sourceNode = nodes.find(node => node.id === edge.source);
          const targetNode = nodes.find(node => node.id === edge.target);

          return {
            source_id: edge.source,
            source_output_key: edge.sourceHandle,
            source_output_type: sourceNode?.config?.data?.output_schema?.[edge.sourceHandle] || 'str',
            target_id: edge.target,
            target_input_key: edge.targetHandle,
            target_input_type: targetNode?.config?.data?.input_schema?.[edge.targetHandle] || 'str',
          };
        }),
      };
      console.log('send to b/e workflow:', updatedWorkflow);
      // await updateWorkflow(workflowID, updatedWorkflow);
    } catch (error) {
      console.error('Error saving workflow:', error);
    }
  }, [workflowID, nodes, edges, workflowInputVariables]);

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