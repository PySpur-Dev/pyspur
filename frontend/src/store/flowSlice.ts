import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { applyNodeChanges, applyEdgeChanges, addEdge, Node as FlowNode, Edge, NodeChange, EdgeChange, Connection } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { createNode } from '../utils/nodeFactory';
import { NodeTypes, NodeType } from '../types/nodes/base';
import type { Draft } from 'immer';

type WritableNode = Draft<FlowNode>;

interface Coordinates {
  x: number;
  y: number;
}

interface WorkflowNode {
  node_type: string;
  id: string;
  coordinates: Coordinates;
  config: Record<string, any>;
}

interface WorkflowLink {
  selected?: boolean;
  source_id: string;
  target_id: string;
  source_output_key: string;
  target_input_key: string;
}

interface WorkflowDefinition {
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  input_variables?: Record<string, any>;
}

interface TestInput {
  id: string;
  [key: string]: any;
}

interface FlowState {
  nodeTypes: NodeTypes;
  nodes: WritableNode[];
  edges: Edge[];
  workflowID: string | null;
  selectedNode: string | null;
  sidebarWidth: number;
  projectName: string;
  workflowInputVariables: Record<string, any>;
  testInputs: TestInput[];
  inputNodeValues: Record<string, any>;
  history: {
    past: Array<{nodes: WritableNode[], edges: Edge[]}>;
    future: Array<{nodes: WritableNode[], edges: Edge[]}>;
  };
}

const initialState: FlowState = {
  nodeTypes: {},
  nodes: [],
  edges: [],
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

const flowSlice = createSlice({
  name: 'flow',
  initialState,
  reducers: {
    initializeFlow: (state, action: PayloadAction<{
      workflowID: string;
      definition: WorkflowDefinition;
      name: string;
      nodeTypes: Record<string, NodeType[]>;
    }>) => {
      const { workflowID, definition, name, nodeTypes } = action.payload;
      state.workflowID = workflowID;
      state.projectName = name;
      state.nodeTypes = nodeTypes;
      const { nodes, links } = definition;

      // Filter out any null nodes that might be returned from createNode
      const createdNodes = nodes
        .map(node => createNode(nodeTypes, node.node_type, node.id,
          { x: node.coordinates.x, y: node.coordinates.y },
          { config: node.config }))
        .filter((node): node is NonNullable<ReturnType<typeof createNode>> => node !== null)
        .map(node => node as unknown as WritableNode);
      state.nodes = createdNodes;
      state.edges = links.map(link => ({
        id: uuidv4(),
        key: uuidv4(),
        selected: link.selected || false,
        source: link.source_id,
        target: link.target_id,
        sourceHandle: link.source_output_key,
        targetHandle: link.target_input_key
      }));

      if (definition.input_variables) {
        state.workflowInputVariables = definition.input_variables;
      }
    },

    nodesChange: (state, action: PayloadAction<{ changes: NodeChange[] }>) => {
      state.nodes = applyNodeChanges(action.payload.changes, state.nodes);
    },

    edgesChange: (state, action: PayloadAction<{ changes: EdgeChange[] }>) => {
      state.edges = applyEdgeChanges(action.payload.changes, state.edges);
    },

    connect: (state, action: PayloadAction<{ connection: Connection }>) => {
      saveToHistory(state);
      state.edges = addEdge(action.payload.connection, state.edges);
    },

    addNode: (state, action: PayloadAction<{ node: FlowNode }>) => {
      if (action.payload.node) {
        saveToHistory(state);
        state.nodes = [...state.nodes, action.payload.node as unknown as WritableNode];
      }
    },

    setNodes: (state, action: PayloadAction<{ nodes: FlowNode[] }>) => {
      state.nodes = action.payload.nodes.map(node => node as unknown as WritableNode);
    },

    updateNodeData: (state, action: PayloadAction<{ id: string; data: any }>) => {
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
      state.edges = state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
      if (state.selectedNode === nodeId) {
        state.selectedNode = null;
      }
    },

    deleteEdge: (state, action: PayloadAction<{ edgeId: string }>) => {
      saveToHistory(state);
      const edgeId = action.payload.edgeId;
      state.edges = state.edges.filter((edge) => edge.id !== edgeId);
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

    resetFlow: (state, action: PayloadAction<{ definition: WorkflowDefinition }>) => {
      const { nodes, links } = action.payload.definition;

      // Filter out any null nodes that might be returned from createNode
      const createdNodes = nodes
        .map(node => createNode(state.nodeTypes, node.node_type, node.id,
          { x: node.coordinates.x, y: node.coordinates.y },
          { config: node.config }))
        .filter((node): node is NonNullable<ReturnType<typeof createNode>> => node !== null)
        .map(node => node as unknown as WritableNode);

      state.nodes = createdNodes;

      state.edges = links.map(link => ({
        id: uuidv4(),
        key: uuidv4(),
        selected: link.selected || false,
        source: link.source_id,
        target: link.target_id,
        sourceHandle: link.source_output_key,
        targetHandle: link.target_input_key
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

export const selectNodeById = (state: { flow: FlowState }, nodeId: string): FlowNode | undefined => {
  return state.flow.nodes.find((node) => node.id === nodeId) as FlowNode | undefined;
};
