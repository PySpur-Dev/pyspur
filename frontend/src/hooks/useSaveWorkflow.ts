import { useCallback, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { updateWorkflow } from '../utils/api';
import { RootState } from '../store/store';
import { debounce } from 'lodash';
import { WorkflowCreateRequest, WorkflowNode } from '@/types/api_types/workflowSchemas';
import { WorkflowNodeCoordinates } from '@/types/api_types/workflowSchemas';
import { FlowWorkflowNodeConfig } from '../store/flowSlice';

// Use existing types from flowSlice.ts
type Position = WorkflowNodeCoordinates;

interface NodeData {
  config: FlowWorkflowNodeConfig;
  title?: string;
}
import { FlowWorkflowNode as Node, FlowWorkflowEdge as Edge } from '../store/flowSlice';

export const useSaveWorkflow = () => {
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const edges = useSelector((state: RootState) => state.flow.edges);
  const nodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs);
  const workflowID = useSelector((state: RootState) => state.flow.workflowID);
  const workflowInputVariables = useSelector((state: RootState) => state.flow.workflowInputVariables);
  const workflowName = useSelector((state: RootState) => state.flow.projectName);
  const testInputs = useSelector((state: RootState) => state.flow.testInputs);

  // Create a ref to store the current values
  const valuesRef = useRef({ nodes, edges, nodeConfigs, workflowID, workflowInputVariables, workflowName, testInputs });

  // Update the ref when values change
  useEffect(() => {
    valuesRef.current = { nodes, edges, nodeConfigs, workflowID, workflowInputVariables, workflowName, testInputs };
  }, [nodes, edges, nodeConfigs, workflowID, workflowInputVariables, workflowName, testInputs]);

  // Create the debounced save function once
  const debouncedSave = useRef(
    debounce(async () => {
      const { nodes, edges, nodeConfigs, workflowID, workflowName, testInputs } = valuesRef.current;

      try {
        const updatedNodes = nodes
          .filter((node): node is NonNullable<typeof node> => node !== null && node !== undefined)
          .map((node) => {
            const config = nodeConfigs[node.id] || {};
            const title = config.title || node.data.title;

            // Ensure the RouterNode structure uses route_map
            if (node.type === 'RouterNode') {
              const { route_map, ...restConfig } = config;

              const routeMap = Object.entries(route_map || {}).reduce((map: Record<string, any>, [_, route], index) => {
                const routeName = `Route_${index + 1}`;
                map[routeName] = { conditions: route.conditions };
                return map;
              }, {});

              return {
                ...node,
                config: {
                  ...config,
                  route_map: config.route_map || {}, // Ensure route_map exists
                },
                title,
                new_id: title || node.type || 'Untitled',
              };
            }

            return {
              ...node,
              config,
              title,
              new_id: title || node.type || 'Untitled',
            };
          });

        const updatedWorkflow: WorkflowCreateRequest = {
          name: workflowName,
          description: '',
          definition: {
            nodes: updatedNodes.map((node) => ({
              id: node.new_id,
              node_type: node.type,
              config: node.config,
              coordinates: node.position,
            }) as WorkflowNode),
            links: edges.map((edge: Edge) => {
              const sourceNode = updatedNodes.find((node) => node?.id === edge.source);
              const targetNode = updatedNodes.find((node) => node?.id === edge.target);

              if (sourceNode?.type === 'RouterNode') {
                return {
                  source_id: sourceNode?.new_id || '',
                  target_id: targetNode?.new_id || '',
                  source_handle: edge.sourceHandle,
                  target_handle: edge.targetHandle,
                };
              } else {
                return {
                  source_id: sourceNode?.new_id || '',
                  target_id: targetNode?.new_id || '',
                };
              }
            }),
            test_inputs: testInputs,
          }
        };

        await updateWorkflow(workflowID, updatedWorkflow);
      } catch (error) {
        console.error('Error saving workflow:', error);
      }
    }, 1000)
  ).current;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Return a stable callback that triggers the debounced save
  return useCallback(() => {
    debouncedSave();
  }, [debouncedSave]);
};
