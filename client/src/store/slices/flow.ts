import { WorkflowLinkSchema, WorkflowNodeSchema } from "@/api/generated";
import { LLMNode, PrimitiveNode, PythonNode } from "@/types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface FlowState {
  nodes: { [id: string]: WorkflowNodeSchema };
  links: WorkflowLinkSchema[];
  selectedNode: WorkflowNodeSchema | null;
  supportedNodeTypes: { [id: string]: LLMNode | PrimitiveNode | PythonNode };
}

const initialState: FlowState = {
  nodes: {},
  links: [],
  selectedNode: null,
  supportedNodeTypes: {},
};

export const flowSlice = createSlice({
  name: "flow",
  initialState,
  reducers: {
    initialize(state, action: PayloadAction<Partial<FlowState>>) {
      state = { ...state, ...action.payload };
      return state;
    },
    setSelectedNode(state, action: PayloadAction<string | null>) {
      if (action.payload) {
        state.selectedNode = state.nodes[action.payload];
        state.nodes = state.nodes;
      } else {
        state.selectedNode = null;
      }
      return state;
    },
    updateNodes(
      state,
      action: PayloadAction<{ [id: string]: WorkflowNodeSchema }>
    ) {
      state.nodes = { ...state.nodes, ...action.payload };
      return state;
    },
    updateNode(
      state,
      action: PayloadAction<{ id: string; node: Partial<WorkflowNodeSchema> }>
    ) {
      const { id, node } = action.payload;
      state.nodes[id] = {
        ...state.nodes[id],
        ...node,
        config: {
          ...state.nodes[id].config,
          ...node.config,
        },
      };
    },
  },
});

export const flowActions = flowSlice.actions;
export const flowReducer = flowSlice.reducer;
