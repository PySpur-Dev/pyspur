import {
  Edge,
  Node,
  EdgeChange,
  Connection,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  NodeChange
} from '@xyflow/react';
import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { WritableDraft } from 'immer';
import { CustomEdge } from '../types/reactflow';
import { WorkflowNode } from '../types/workflow';
import { NodeTypes, NodeType } from '../types/nodes/base';
import { createNode, getNodeType } from '../utils/nodeFactory';
import type { RootState } from '../types/store';

type WritableNode = WritableDraft<Node>;
type WritableEdge = WritableDraft<Edge>;

interface Coordinates {
  x: number;
  y: number;
}

interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: CustomEdge[];
  test_inputs?: TestInput[];
  input_variables?: Record<string, any>;
}

interface TestInput {
  id?: string;
  [key: string]: any;
}

interface FlowState {
  nodes: WritableDraft<WorkflowNode>[];
  edges: WritableEdge[];
  selectedNode: string | null;
  sidebarWidth: number;
  projectName: string;
  workflowID?: string;
  nodeTypes: Record<string, NodeType[]>;
  testInputs: Record<string, unknown>[];
  workflowInputVariables: Record<string, unknown>;
  inputNodeValues: Record<string, unknown>;
  history: {
    past: Array<{
      nodes: WritableDraft<WorkflowNode>[];
      edges: WritableEdge[];
      selectedNode: string | null;
      sidebarWidth: number;
      projectName: string;
      workflowID?: string;
      nodeTypes: Record<string, NodeType[]>;
      testInputs: Record<string, unknown>[];
      workflowInputVariables: Record<string, unknown>;
      inputNodeValues: Record<string, unknown>;
    }>;
    future: Array<{
      nodes: WritableDraft<WorkflowNode>[];
      edges: WritableEdge[];
      selectedNode: string | null;
      sidebarWidth: number;
      projectName: string;
      workflowID?: string;
      nodeTypes: Record<string, NodeType[]>;
      testInputs: Record<string, unknown>[];
      workflowInputVariables: Record<string, unknown>;
      inputNodeValues: Record<string, unknown>;
    }>;
  };
}

const initialState: FlowState = {
  nodes: [],
  edges: [],
  selectedNode: null,
  sidebarWidth: 400,
  projectName: 'Untitled Project',
  workflowID: undefined,
  nodeTypes: {},
  testInputs: [],
  workflowInputVariables: {},
  inputNodeValues: {},
  history: {
    past: [],
    future: []
  }
};

const saveToHistory = (state: WritableDraft<FlowState>) => {
  state.history.past.push({
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: JSON.parse(JSON.stringify(state.edges)),
    selectedNode: state.selectedNode,
    sidebarWidth: state.sidebarWidth,
    projectName: state.projectName,
    workflowID: state.workflowID,
    nodeTypes: state.nodeTypes,
    testInputs: state.testInputs,
    workflowInputVariables: state.workflowInputVariables,
    inputNodeValues: state.inputNodeValues
  });
  state.history.future = [];
};

const flowSlice = createSlice({
  name: 'flow',
  initialState,
  reducers: {
    initializeFlow: (state, action: PayloadAction<{
      workflowID: string;
      definition: WorkflowDefinition;
      name: string;
      nodeTypes: NodeTypes;
    }>) => {
      const { workflowID, definition, name, nodeTypes } = action.payload;
      state.workflowID = workflowID;
      state.projectName = name;
      state.nodeTypes = nodeTypes;
      const { nodes, edges } = definition;

      // Filter out any null nodes that might be returned from createNode
      const createdNodes = nodes
        .map(node => {
          // Extract additional properties excluding required fields
          const additionalConfig: Record<string, unknown> = {};
          Object.entries(node.data?.config || {}).forEach(([key, value]) => {
            if (!['title', 'input_schema', 'output_schema'].includes(key)) {
              additionalConfig[key] = value;
            }
          });

          // Create node config with required fields last to ensure they're not overwritten
          const nodeConfig = {
            ...additionalConfig,
            title: String(node.data?.config?.title || node.type),
            input_schema: node.data?.config?.input_schema || {},
            output_schema: node.data?.config?.output_schema || {},
          };

          return createNode(
            nodeTypes,
            node.type || 'dynamic',
            node.id,
            { x: node.position?.x ?? 100, y: node.position?.y ?? 100 },
            { config: nodeConfig }
          );
        })
        .filter((node): node is NonNullable<ReturnType<typeof createNode>> => node !== null)
        .map(node => node as unknown as WritableDraft<WorkflowNode>);
      state.nodes = createdNodes;
      state.edges = edges.map(edge => ({
        id: edge.id || uuidv4(),
        key: uuidv4(),
        selected: edge.selected || false,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        data: edge.data
      }));

      if (definition.input_variables) {
        state.workflowInputVariables = definition.input_variables;
      }
    },

    nodesChange: (state, action: PayloadAction<{ changes: NodeChange[] }>) => {
      saveToHistory(state);
      const newNodes = applyNodeChanges(action.payload.changes, state.nodes);
      state.nodes = newNodes as WritableDraft<WorkflowNode>[];
    },

    edgesChange: (state, action: PayloadAction<{ changes: EdgeChange[] }>) => {
      const newEdges = applyEdgeChanges(action.payload.changes, state.edges);
      state.edges = newEdges.map(edge => ({
        ...edge,
        key: edge.id,
        data: edge.data || {}
      })) as CustomEdge[];
    },

    connect: (state, action: PayloadAction<{ connection: Connection & { data?: Record<string, unknown> } }>) => {
      saveToHistory(state);
      const newEdge: CustomEdge = {
        ...action.payload.connection,
        id: uuidv4(),
        key: uuidv4(),
        data: action.payload.connection.data || {}
      };
      state.edges = [...state.edges, newEdge];
    },

    addNode: (state, action: PayloadAction<{ node: WorkflowNode }>) => {
      saveToHistory(state);
      state.nodes = [...state.nodes, action.payload.node];
    },

    setNodes: (state, action: PayloadAction<WritableDraft<WorkflowNode>[]>) => {
      saveToHistory(state);
      state.nodes = action.payload;
    },

    updateNodeData: (state, action: PayloadAction<{ id: string; data: Partial<WorkflowNode['data']> }>) => {
      const { id, data } = action.payload;
      const node = state.nodes.find((node) => node.id === id);
      if (node) {
        node.data = { ...node.data, ...data };
      }
    },

    setSelectedNode: (state, action: PayloadAction<{ nodeId: string | null }>) => {
      state.selectedNode = action.payload.nodeId;
    },

    deleteNode: (state, action: PayloadAction<{ nodeId: string }>) => {
      const nodeId = action.payload.nodeId;
      saveToHistory(state);
      state.nodes = state.nodes.filter((node) => node.id !== nodeId);
      state.edges = state.edges.filter((edge: WritableDraft<Edge>) => edge.source !== nodeId && edge.target !== nodeId);
      if (state.selectedNode === nodeId) {
        state.selectedNode = null;
      }
    },

    deleteEdge: (state, action: PayloadAction<{ edgeId: string }>) => {
      saveToHistory(state);
      const edgeId = action.payload.edgeId;
      state.edges = state.edges.filter((edge: WritableDraft<Edge>) => edge.id !== edgeId);
    },

    deleteEdgeByHandle: (state, action: PayloadAction<{ nodeId: string; handleKey: string }>) => {
      const { nodeId, handleKey } = action.payload;
      state.edges = state.edges.filter((edge: WritableDraft<Edge>) => {
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
      state.edges = state.edges.filter((edge: WritableDraft<Edge>) => edge.source !== sourceId);
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
    },

    deleteWorkflowInputVariable: (state, action: PayloadAction<{ key: string }>) => {
      const { key } = action.payload;
      delete state.workflowInputVariables[key];
      state.edges = state.edges.filter(edge => edge.sourceHandle !== key);
    },

    updateWorkflowInputVariableKey: (state, action: PayloadAction<{ oldKey: string; newKey: string }>) => {
      const { oldKey, newKey } = action.payload;
      if (oldKey !== newKey) {
        state.workflowInputVariables[newKey] = state.workflowInputVariables[oldKey];
        delete state.workflowInputVariables[oldKey];
        state.edges = state.edges.map(edge => {
          if (edge.sourceHandle === oldKey) {
            return { ...edge, sourceHandle: newKey };
          }
          return edge;
        });
      }
    },

    resetFlow: (state, action: PayloadAction<{ nodes: WorkflowNode[]; edges: Edge[] }>) => {
      const createdNodes = action.payload.nodes.map(node => ({
        ...node,
        id: node.id || uuidv4(),
      })) as WritableDraft<WorkflowNode>[];
      state.nodes = createdNodes;

      state.edges = action.payload.edges.map(edge => ({
        id: edge.id || uuidv4(),
        key: uuidv4(),
        selected: edge.selected || false,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        data: edge.data
      })) as WritableEdge[];
      saveToHistory(state);
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
        data: { ...node.data, run: undefined }
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

    deleteTestInput: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload;
      state.testInputs = state.testInputs.filter((input) => input.id !== id);
    },

    setEdges: (state, action) => {
      state.edges = action.payload.edges;
    },

    undo: (state) => {
      if (state.history.past.length > 0) {
        const previous = state.history.past[state.history.past.length - 1];
        state.history.future.push({
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges)),
          selectedNode: state.selectedNode,
          sidebarWidth: state.sidebarWidth,
          projectName: state.projectName,
          workflowID: state.workflowID,
          nodeTypes: state.nodeTypes,
          testInputs: state.testInputs,
          workflowInputVariables: state.workflowInputVariables,
          inputNodeValues: state.inputNodeValues
        });
        state.nodes = previous.nodes;
        state.edges = previous.edges;
        state.history.past.pop();
      }
    },

    redo: (state) => {
      const next = state.history.future.pop();
      if (next) {
        state.history.past.push({
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges)),
          selectedNode: state.selectedNode,
          sidebarWidth: state.sidebarWidth,
          projectName: state.projectName,
          workflowID: state.workflowID,
          nodeTypes: state.nodeTypes,
          testInputs: state.testInputs,
          workflowInputVariables: state.workflowInputVariables,
          inputNodeValues: state.inputNodeValues
        });
        state.nodes = next.nodes;
        state.edges = next.edges;
      }
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
  updateNodeData,
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
} = flowSlice.actions;

export default flowSlice.reducer;

export const selectNodeById = (state: RootState, nodeId: string): WorkflowNode | undefined => {
  return state.flow.nodes.find((node) => node.id === nodeId) as WorkflowNode | undefined;
};
