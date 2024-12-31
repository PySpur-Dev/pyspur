import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { applyNodeChanges, applyEdgeChanges, addEdge, NodeChange, EdgeChange, Connection } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { createNode } from '../utils/nodeFactory';
import { TestInput } from '@/types/api_types/workflowSchemas';
import { WorkflowDefinition, WorkflowNodeCoordinates } from '@/types/api_types/workflowSchemas';
import { RouteConditionGroup } from '@/types/api_types/routerSchemas';
import { isEqual } from 'lodash';


export interface NodeTypes {
  [key: string]: any;
}

export interface NodeTypesConfig {
  [category: string]: Array<{
    name: string;
    [key: string]: any;
  }>;
}

export interface CreateNodeResult {
  node: FlowWorkflowNode;
  config: FlowWorkflowNodeConfig;
}

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  title?: string;
  acronym?: string;
  color?: string;
}

export interface BaseNode {
  id: string;
  position: Position;
  type: string;
  data?: NodeData;
}

export interface FlowWorkflowNodeConfig {
  title?: string;
  type?: string;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  system_message?: string;
  user_message?: string;
  few_shot_examples?: Array<{
    input: string;
    output: string;
  }> | Record<string, any>[];
  llm_info?: {
    model?: string;
    api_base?: string;
    [key: string]: any;
  };
  route_map?: Record<string, RouteConditionGroup>;
  preferences?: string[];
  [key: string]: any;
}

export interface FlowWorkflowNode {
  id: string;
  type: string;
  position: WorkflowNodeCoordinates;
  data: {
    title: string;
    acronym: string;
    color: string;
    run?: Record<string, any>;
    taskStatus?: string;
    [key: string]: any;
  };
  measured?: {
    width: number;
    height: number;
  };
  [key: string]: any;
}

export interface FlowWorkflowEdge {
  id: string;
  key: string;
  source: string;
  target: string;
  selected?: boolean;
  sourceHandle: string;
  targetHandle: string;
  [key: string]: any;
}

export interface FlowState {
  nodeTypes: NodeTypes;
  nodes: FlowWorkflowNode[];
  edges: FlowWorkflowEdge[];
  nodeConfigs: Record<string, FlowWorkflowNodeConfig>;
  workflowID: string | null;
  selectedNode: string | null;
  sidebarWidth: number;
  projectName: string;
  workflowInputVariables: Record<string, any>;
  testInputs: TestInput[];
  inputNodeValues: Record<string, any>;
  history: {
    past: Array<{ nodes: FlowWorkflowNode[], edges: FlowWorkflowEdge[] }>;
    future: Array<{ nodes: FlowWorkflowNode[], edges: FlowWorkflowEdge[] }>;
  };
}

const initialState: FlowState = {
  nodeTypes: {},
  nodes: [],
  edges: [],
  nodeConfigs: {},
  workflowID: null,
  selectedNode: null,
  sidebarWidth: 400,
  projectName: 'Untitled Project',
  workflowInputVariables: {},
  testInputs: [],
  inputNodeValues: {},
  history: {
    past: [],
    future: []
  }
};

const saveToHistory = (state: FlowState) => {
  state.history.past.push({
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: JSON.parse(JSON.stringify(state.edges))
  });
  state.history.future = [];
};

function rebuildRouterNodeSchema(state: FlowState, routerNode: FlowWorkflowNode) {
  const incomingEdges = state.edges.filter((edge) => edge.target === routerNode.id);

  // Build new output schema by combining all source nodes
  const newOutputSchema = incomingEdges.reduce((schema, edge) => {
    const sourceNode = state.nodes.find((n) => n.id === edge.source);
    const sourceNodeConfig = sourceNode ? state.nodeConfigs[sourceNode.id] : undefined;
    if (sourceNodeConfig?.output_schema) {
      const nodeTitle = sourceNodeConfig.title || sourceNode?.id;
      const sourceSchema = sourceNodeConfig.output_schema;

      // Add prefixed entries from the source schema
      Object.entries(sourceSchema).forEach(([key, value]) => {
        schema[`${nodeTitle}.${key}`] = value;
      });
    }
    return schema;
  }, {} as Record<string, any>);

  const routerNodeConfig = state.nodeConfigs[routerNode.id] || {};
  const currentSchema = routerNodeConfig.output_schema || {};
  const hasChanges = !isEqual(currentSchema, newOutputSchema);

  // Only update if there are actual changes
  if (hasChanges) {
    state.nodeConfigs[routerNode.id] = {
      ...routerNodeConfig,
      output_schema: newOutputSchema
    };
  }
}

function rebuildCoalesceNodeSchema(state: FlowState, coalesceNode: FlowWorkflowNode) {
  const incomingEdges = state.edges.filter((edge) => edge.target === coalesceNode.id);

  // Collect all source schemas
  const schemas: Record<string, any>[] = incomingEdges.map((ed) => {
    const sourceNode = state.nodes.find((n) => n.id === ed.source);
    return sourceNode ? state.nodeConfigs[sourceNode.id]?.output_schema || {} : {};
  });

  // Intersection
  let intersection: Record<string, any> = {};
  if (schemas.length > 0) {
    const firstSchema = schemas[0];
    const commonKeys = Object.keys(firstSchema).filter((key) =>
      schemas.every((sch) => sch.hasOwnProperty(key) && sch[key] === firstSchema[key])
    );
    commonKeys.forEach((key) => {
      intersection[key] = firstSchema[key];
    });
  }

  const coalesceNodeConfig = state.nodeConfigs[coalesceNode.id] || {};
  state.nodeConfigs[coalesceNode.id] = {
    ...coalesceNodeConfig,
    output_schema: intersection
  };
}

const flowSlice = createSlice({
  name: 'flow',
  initialState,
  reducers: {
    initializeFlow: (state, action: PayloadAction<{
      workflowID: string;
      definition: WorkflowDefinition;
      name: string;
      nodeTypes: NodeTypesConfig;
    }>) => {
      const { workflowID, definition, name } = action.payload;
      state.workflowID = workflowID;
      state.projectName = name;
      state.nodeTypes = action.payload.nodeTypes;
      const { nodes, links } = definition;
      state.nodes = nodes.map((node) => {
        const { node: nodeObj } = createNode(
          state.nodeTypes,
          node.node_type,
          node.id,
          { x: node.coordinates.x, y: node.coordinates.y },
        );
        // Load the config directly from the definition instead of creating fresh
        state.nodeConfigs[node.id] = node.config;
        return nodeObj;
      });

      let edges = links.map(link => ({
        id: uuidv4(),
        key: uuidv4(),
        selected: false,
        source: link.source_id,
        target: link.target_id,
        sourceHandle: link.source_handle || state.nodes.find(node => node.id === link.source_id)?.data?.title,
        targetHandle: link.target_handle || state.nodes.find(node => node.id === link.source_id)?.data?.title,
      }));
      // deduplicate edges
      edges = edges.filter((edge, index, self) =>
        index === self.findIndex((t) => (
          t.source === edge.source && t.target === edge.target
        ))
      );
      state.edges = edges;


    },

    nodesChange: (state, action: PayloadAction<{ changes: NodeChange[] }>) => {
      state.nodes = applyNodeChanges(action.payload.changes, state.nodes) as FlowWorkflowNode[];
    },

    edgesChange: (state, action: PayloadAction<{ changes: EdgeChange[] }>) => {
      state.edges = applyEdgeChanges(action.payload.changes, state.edges) as FlowWorkflowEdge[];
    },

    connect: (state, action: PayloadAction<{ connection: Connection }>) => {
      saveToHistory(state);
      const { connection } = action.payload;

      // Avoid duplicates
      if (state.edges.find((edge) => edge.source === connection.source && edge.target === connection.target)) {
        return;
      }
      state.edges = addEdge(connection, state.edges);

      const targetNode = state.nodes.find((node) => node.id === connection.target);
      if (!targetNode) return;

      // If it's a RouterNode, rebuild schema
      if (targetNode.type === 'RouterNode') {
        rebuildRouterNodeSchema(state, targetNode);
      }
      // If it's a CoalesceNode, rebuild intersection
      if (targetNode.type === 'CoalesceNode') {
        rebuildCoalesceNodeSchema(state, targetNode);
      }
    },

    addNode: (state, action: PayloadAction<{ node: FlowWorkflowNode }>) => {
      if (action.payload.node) {
        saveToHistory(state);
        state.nodes = [...state.nodes, action.payload.node];
      }
    },

    setNodes: (state, action: PayloadAction<{ nodes: FlowWorkflowNode[] }>) => {
      state.nodes = action.payload.nodes;
    },

    updateNodeDataOnly: (state, action: PayloadAction<{ id: string; data: any }>) => {
      const { id, data } = action.payload;

      // Update node data only
      const node = state.nodes.find(n => n.id === id);
      if (node) {
        node.data = {
          ...node.data,
          ...data,
          // Preserve taskStatus if it exists in the current data and isn't being updated
          taskStatus: data.taskStatus !== undefined ? data.taskStatus : node.data?.taskStatus
        };
      }
    },

    updateNodeConfigOnly: (state, action: PayloadAction<{ id: string; data: any }>) => {
      const { id, data } = action.payload;

      // Only update nodeConfigs
      state.nodeConfigs[id] = {
        ...state.nodeConfigs[id],
        ...data
      };

      // Handle title changes in edges if title was updated
      const oldTitle = state.nodeConfigs[id]?.title;
      const newTitle = data.title;

      if (oldTitle && newTitle && oldTitle !== newTitle) {
        state.edges = state.edges.map((edge) => {
          if (edge.source === id && edge.sourceHandle === oldTitle) {
            return { ...edge, sourceHandle: newTitle };
          }
          if (edge.target === id && edge.targetHandle === oldTitle) {
            return { ...edge, targetHandle: newTitle };
          }
          return edge;
        });
      }

      // If output_schema changed, rebuild connected RouterNode/CoalesceNode schemas
      if (data?.output_schema) {
        const connectedRouterNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'RouterNode' &&
            state.edges.some((edge) => edge.source === id && edge.target === targetNode.id)
        );
        connectedRouterNodes.forEach((routerNode) => {
          rebuildRouterNodeSchema(state, routerNode);
        });

        const connectedCoalesceNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'CoalesceNode' &&
            state.edges.some((edge) => edge.source === id && edge.target === targetNode.id)
        );
        connectedCoalesceNodes.forEach((coalesceNode) => {
          rebuildCoalesceNodeSchema(state, coalesceNode);
        });
      }
    },

    setSelectedNode: (state, action: PayloadAction<{ nodeId: string | null }>) => {
      state.selectedNode = action.payload.nodeId;
    },

    deleteNode: (state, action: PayloadAction<{ nodeId: string }>) => {
      const nodeId = action.payload.nodeId;
      saveToHistory(state);
      state.nodes = state.nodes.filter((node) => node.id !== nodeId);
      state.edges = state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
      if (state.selectedNode === nodeId) {
        state.selectedNode = null;
      }
    },

    deleteEdge: (state, action: PayloadAction<{ edgeId: string }>) => {
      saveToHistory(state);
      const edgeId = action.payload.edgeId;
      const edge = state.edges.find(e => e.id === edgeId);

      if (edge) {
        // Find the target node
        const targetNode = state.nodes.find(node => node.id === edge.target);
        const sourceNode = state.nodes.find(node => node.id === edge.source);
        const targetNodeConfig = targetNode ? state.nodeConfigs[targetNode.id] : undefined;
        const sourceNodeConfig = sourceNode ? state.nodeConfigs[sourceNode.id] : undefined;

        // If target is a RouterNode and source has output schema, update target's schema
        if (targetNode?.type === 'RouterNode' && sourceNodeConfig?.output_schema) {
          const sourceTitle = sourceNodeConfig.title || sourceNode?.id;
          const currentSchema = { ...(targetNodeConfig?.output_schema || {}) };

          // Remove fields that start with this source's prefix
          const prefix = `${sourceTitle}.`;
          Object.keys(currentSchema).forEach(key => {
            if (key.startsWith(prefix)) {
              delete currentSchema[key];
            }
          });

          // Update the target node's schema
          state.nodeConfigs[targetNode.id] = {
            ...targetNodeConfig,
            output_schema: currentSchema
          };
        }

        if (targetNode?.type === 'CoalesceNode') {
          // Filter out the edge we're deleting so it doesn't appear in the intersection
          const incomingEdges = state.edges.filter((e) => e.target === targetNode.id && e.id !== edgeId);

          // Collect all source schemas from remaining edges
          const schemas: Record<string, any>[] = [];
          incomingEdges.forEach((ed) => {
            const sourceNode = state.nodes.find((n) => n.id === ed.source);
            const sourceNodeConfig = sourceNode ? state.nodeConfigs[sourceNode.id] : undefined;
            if (sourceNodeConfig?.output_schema) {
              schemas.push(sourceNodeConfig.output_schema);
            }
          });

          // Compute intersection
          let intersection: Record<string, any> = {};
          if (schemas.length > 0) {
            const firstSchema = schemas[0];
            const commonKeys = Object.keys(firstSchema).filter((key) =>
              schemas.every((sch) => sch.hasOwnProperty(key) && sch[key] === firstSchema[key])
            );
            commonKeys.forEach((key) => {
              intersection[key] = firstSchema[key];
            });
          }

          state.nodeConfigs[targetNode.id] = {
            ...targetNodeConfig,
            output_schema: intersection
          };
        }

        // Remove the edge
        state.edges = state.edges.filter((e) => e.id !== edgeId);
      }
    },

    deleteEdgeByHandle: (state, action: PayloadAction<{ nodeId: string; handleKey: string }>) => {
      const { nodeId, handleKey } = action.payload;
      state.edges = state.edges.filter((edge) => {
        if (edge.source === nodeId && edge.sourceHandle === handleKey) {
          return false;
        }
        if (edge.target === nodeId && edge.targetHandle === handleKey) {
          return false;
        }
        return true;
      });
    },

    deleteEdgesBySource: (state, action: PayloadAction<{ sourceId: string }>) => {
      const { sourceId } = action.payload;
      state.edges = state.edges.filter((edge) => edge.source !== sourceId);
    },

    setSidebarWidth: (state, action: PayloadAction<number>) => {
      state.sidebarWidth = action.payload;
    },

    setProjectName: (state, action: PayloadAction<string>) => {
      state.projectName = action.payload;
    },

    setWorkflowInputVariable: (state, action: PayloadAction<{ key: string; value: any }>) => {
      const { key, value } = action.payload;
      state.workflowInputVariables[key] = value;

      // Set the output schema for the input node
      const inputNode = state.nodes.find((node) => node.type === 'InputNode');
      if (inputNode) {
        const currentConfig = state.nodeConfigs[inputNode.id] || {};
        state.nodeConfigs[inputNode.id] = {
          ...currentConfig,
          output_schema: {
            ...(currentConfig.output_schema || {}),
            [key]: value,
          },
        };
      }

      if (inputNode?.id) {
        // Update RouterNodes directly connected
        const connectedRouterNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'RouterNode' &&
            state.edges.some((edge) => edge.source === inputNode.id && edge.target === targetNode.id)
        );
        connectedRouterNodes.forEach((routerNode) => {
          rebuildRouterNodeSchema(state, routerNode);
        });

        // Update CoalesceNodes directly connected
        const connectedCoalesceNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'CoalesceNode' &&
            state.edges.some((edge) => edge.source === inputNode.id && edge.target === targetNode.id)
        );
        connectedCoalesceNodes.forEach((coalesceNode) => {
          rebuildCoalesceNodeSchema(state, coalesceNode);
        });
      }
    },

    deleteWorkflowInputVariable: (state, action: PayloadAction<{ key: string }>) => {
      const { key } = action.payload;

      // Remove from input node output schema
      const inputNode = state.nodes.find((node) => node.type === 'InputNode');
      if (inputNode) {
        const currentConfig = state.nodeConfigs[inputNode.id] || {};
        const currentSchema = { ...(currentConfig.output_schema || {}) };
        delete currentSchema[key];
        state.nodeConfigs[inputNode.id] = {
          ...currentConfig,
          output_schema: currentSchema,
        };
      }
      // Remove from global workflowInputVariables
      delete state.workflowInputVariables[key];

      // Remove edges whose sourceHandle === key
      state.edges = state.edges.filter((edge) => edge.sourceHandle !== key);

      if (inputNode?.id) {
        // Update RouterNodes
        const connectedRouterNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'RouterNode' &&
            state.edges.some((edge) => edge.source === inputNode.id && edge.target === targetNode.id)
        );
        connectedRouterNodes.forEach((routerNode) => {
          rebuildRouterNodeSchema(state, routerNode);
        });

        // Update CoalesceNodes
        const connectedCoalesceNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'CoalesceNode' &&
            state.edges.some((edge) => edge.source === inputNode.id && edge.target === targetNode.id)
        );
        connectedCoalesceNodes.forEach((coalesceNode) => {
          rebuildCoalesceNodeSchema(state, coalesceNode);
        });
      }
    },

    updateWorkflowInputVariableKey: (
      state,
      action: PayloadAction<{ oldKey: string; newKey: string }>
    ) => {
      const { oldKey, newKey } = action.payload;

      // Only proceed if keys differ
      if (oldKey === newKey) return;

      // 1. Rename in `workflowInputVariables` map
      state.workflowInputVariables[newKey] = state.workflowInputVariables[oldKey];
      delete state.workflowInputVariables[oldKey];

      // 2. Rename in the input node's output_schema
      const inputNode = state.nodes.find((node) => node.type === 'InputNode');
      if (inputNode) {
        const currentConfig = state.nodeConfigs[inputNode.id] || {};
        const currentSchema = { ...(currentConfig.output_schema || {}) };
        if (currentSchema.hasOwnProperty(oldKey)) {
          currentSchema[newKey] = currentSchema[oldKey];
          delete currentSchema[oldKey];
        }
        state.nodeConfigs[inputNode.id] = {
          ...currentConfig,
          output_schema: currentSchema,
        };
      }

      // 3. Rename in any edges referencing oldKey
      state.edges = state.edges.map((edge) => {
        if (edge.sourceHandle === oldKey) {
          return { ...edge, sourceHandle: newKey };
        }
        return edge;
      });

      // 4. Rebuild RouterNode/CoalesceNode schemas connected to the input node,
      if (inputNode?.id) {
        const connectedRouterNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'RouterNode' &&
            state.edges.some((edge) => edge.source === inputNode.id && edge.target === targetNode.id)
        );
        connectedRouterNodes.forEach((routerNode) => {
          rebuildRouterNodeSchema(state, routerNode);
        });

        const connectedCoalesceNodes = state.nodes.filter(
          (targetNode) =>
            targetNode.type === 'CoalesceNode' &&
            state.edges.some((edge) => edge.source === inputNode.id && edge.target === targetNode.id)
        );
        connectedCoalesceNodes.forEach((coalesceNode) => {
          rebuildCoalesceNodeSchema(state, coalesceNode);
        });
      }
    },

    resetFlow: (state, action: PayloadAction<{ definition: WorkflowDefinition }>) => {
      const { nodes, links } = action.payload.definition;

      // Map over nodes and use createNode to generate both node and config
      const createdNodes = nodes.map(node => {
        const result = createNode(
          state.nodeTypes,
          node.node_type,
          node.id,
          { x: node.coordinates.x, y: node.coordinates.y },
        );

        if (!result) {
          throw new Error(`Failed to create node with type: ${node.node_type}`);
        }

        const { node: createdNode, config } = result;

        // Store the config in nodeConfigs
        state.nodeConfigs[node.id] = config;

        return createdNode;
      });

      state.nodes = createdNodes;

      // Map over links to create edges
      state.edges = links.map(link => ({
        id: uuidv4(),
        key: uuidv4(),
        selected: false,
        source: link.source_id,
        target: link.target_id,
        sourceHandle: link.source_handle || state.nodes.find(node => node.id === link.source_id)?.data?.title,
        targetHandle: link.target_handle || state.nodes.find(node => node.id === link.target_id)?.data?.title,
      }));
    },

    updateEdgesOnHandleRename: (state, action: PayloadAction<{
      nodeId: string;
      oldHandleId: string;
      newHandleId: string;
      schemaType: 'input_schema' | 'output_schema';
    }>) => {
      const { nodeId, oldHandleId, newHandleId, schemaType } = action.payload;
      state.edges = state.edges.map((edge) => {
        if (schemaType === 'input_schema' && edge.target === nodeId && edge.targetHandle === oldHandleId) {
          return { ...edge, targetHandle: newHandleId };
        }
        if (schemaType === 'output_schema' && edge.source === nodeId && edge.sourceHandle === oldHandleId) {
          return { ...edge, sourceHandle: newHandleId };
        }
        return edge;
      });
    },

    resetRun: (state) => {
      state.nodes = state.nodes.map(node => ({
        ...node,
        data: { ...node.data, run: undefined, taskStatus: undefined }
      }));
    },

    clearCanvas: (state) => {
      state.nodes = [];
      state.edges = [];
      state.selectedNode = null;
      state.workflowInputVariables = {};
      state.testInputs = [];
      state.inputNodeValues = {};
    },

    setTestInputs: (state, action: PayloadAction<TestInput[]>) => {
      state.testInputs = action.payload;
    },
    setNodeOutputs: (state, action) => {
      const nodeOutputs = action.payload;

      state.nodes = state.nodes.map(node => {
        if (node && nodeOutputs[node.id]) {
          return {
            ...node,
            data: {
              ...node.data,
              run: nodeOutputs[node.id],
              taskStatus: nodeOutputs[node.id].status
            },
          };
        }
        return node;
      });
    },
    addTestInput: (state, action) => {
      state.testInputs = [
        ...state.testInputs,
        action.payload,
      ];
    },

    updateTestInput: (state, action: PayloadAction<TestInput>) => {
      const updatedInput = action.payload;
      state.testInputs = state.testInputs.map((input) =>
        input.id === updatedInput.id ? updatedInput : input
      );
    },

    deleteTestInput: (state, action: PayloadAction<{ id: number }>) => {
      const { id } = action.payload;
      state.testInputs = state.testInputs.filter((input) => input.id !== id);
    },

    setEdges: (state, action) => {
      state.edges = action.payload.edges;
    },

    undo: (state) => {
      const previous = state.history.past.pop();
      if (previous) {
        state.history.future.push({
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges))
        });
        state.nodes = previous.nodes;
        state.edges = previous.edges;
      }
    },

    redo: (state) => {
      const next = state.history.future.pop();
      if (next) {
        state.history.past.push({
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges))
        });
        state.nodes = next.nodes;
        state.edges = next.edges;
      }
    },

    updateNodeTitle: (state, action: PayloadAction<{ nodeId: string; newTitle: string }>) => {
      const { nodeId, newTitle } = action.payload;
      const oldTitle = state.nodes.find(node => node.id === nodeId)?.data?.title;

      // Update the node title
      const node = state.nodes.find(node => node.id === nodeId);
      if (node) {
        node.data = {
          ...node.data,
          title: newTitle
        };
      }

      // Update nodeConfigs with the new title
      if (state.nodeConfigs[nodeId]) {
        state.nodeConfigs[nodeId] = {
          ...state.nodeConfigs[nodeId],
          title: newTitle
        };
      }

      // Update edges where this node is source or target
      state.edges = state.edges.map(edge => {
        let updatedEdge = { ...edge };

        // Update source handle if this is the source node
        if (edge.source === nodeId && edge.sourceHandle === oldTitle) {
          updatedEdge.sourceHandle = newTitle;
        }

        // Update references in downstream nodes
        const findDownstreamNodes = (startNodeId: string): Set<string> => {
          const visited = new Set<string>();
          const queue = [startNodeId];

          while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (!visited.has(currentId)) {
              visited.add(currentId);
              state.edges
                .filter(edge => edge.source === currentId)
                .forEach(edge => queue.push(edge.target));
            }
          }
          return visited;
        };

        const downstreamNodes = findDownstreamNodes(nodeId);

        state.nodes = state.nodes.map(node => {
          if (!downstreamNodes.has(node.id)) return node;

          const nodeConfig = state.nodeConfigs[node.id];
          if (nodeConfig) {
            const config = { ...nodeConfig };
            let hasChanges = false;

            Object.keys(config).forEach(key => {
              if (
                key === 'system_message' ||
                key === 'user_message' ||
                key.endsWith('_prompt') ||
                key.endsWith('_message')
              ) {
                const content = config[key];
                if (typeof content === 'string') {
                  const oldPattern = new RegExp(`{{${nodeId}\\.`, 'g');
                  const newContent = content.replace(oldPattern, `{{${newTitle}.`);
                  if (newContent !== content) {
                    config[key] = newContent;
                    hasChanges = true;
                  }
                }
              }
            });

            if (hasChanges) {
              state.nodeConfigs[node.id] = config;
            }
          }
          return node;
        });

        return updatedEdge;  // Return the updated edge
      });
    },

    addNodeWithConfig: (state, action: PayloadAction<CreateNodeResult>) => {
      const { node, config } = action.payload;
      // Add the node
      state.nodes.push(node);
      // Store the config
      state.nodeConfigs[node.id] = config;
    },
  },
});

export const {
  initializeFlow,
  nodesChange,
  edgesChange,
  connect,
  addNode,
  setNodes,
  setEdges,
  updateNodeDataOnly,
  updateNodeConfigOnly,
  setSelectedNode,
  deleteNode,
  deleteEdge,
  deleteEdgeByHandle,
  deleteEdgesBySource,
  setSidebarWidth,
  setProjectName,
  setWorkflowInputVariable,
  deleteWorkflowInputVariable,
  updateWorkflowInputVariableKey,
  resetFlow,
  updateEdgesOnHandleRename,
  resetRun,
  clearCanvas,
  setTestInputs,
  setNodeOutputs,
  addTestInput,
  updateTestInput,
  deleteTestInput,
  undo,
  redo,
  updateNodeTitle,
  addNodeWithConfig,
} = flowSlice.actions;

export default flowSlice.reducer;

export const selectNodeById = (state: { flow: FlowState }, nodeId: string): FlowWorkflowNode | undefined => {
  return state.flow.nodes.find((node) => node.id === nodeId);
};