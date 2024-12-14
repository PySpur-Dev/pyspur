import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { getNodeTypes } from '../utils/api';
import { RootState } from './store';

// Define the types for the conditional node
type ComparisonOperator =
  | "contains"
  | "equals"
  | "greater_than"
  | "less_than"
  | "starts_with"
  | "not_starts_with"
  | "is_empty"
  | "is_not_empty"
  | "number_equals";

type LogicalOperator = "AND" | "OR";

interface Condition {
  variable: string;
  operator: ComparisonOperator;
  value: string;
  logicalOperator?: LogicalOperator;
}

interface BranchCondition {
  conditions: Condition[];
}

interface IfElseNodeConfig {
  branches: BranchCondition[];
  input_schema: Record<string, string>;
  output_schema: Record<string, string>;
  title?: string;
}

// Define interfaces for the metadata structure
export interface NodeMetadata {
  name: string;
  config?: {
    branches?: BranchCondition[];
    input_schema?: Record<string, string>;
    output_schema?: Record<string, string>;
    title?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface NodeTypesState {
  data: Record<string, any>;
  metadata: Record<string, NodeMetadata[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

interface NodeTypesResponse {
  schema: Record<string, any>;
  metadata: Record<string, NodeMetadata[]>;
}

export interface NodeType {
  name: string;
  config: {
    branches?: BranchCondition[];
    input_schema?: Record<string, string>;
    output_schema?: Record<string, string>;
    title?: string;
    [key: string]: any;
  };
  type: string;
  visual_tag: {
    color: string;
    acronym: string;
  };
}

const initialState: NodeTypesState = {
  data: {},
  metadata: {},
  status: 'idle',
  error: null,
};

export const fetchNodeTypes = createAsyncThunk<NodeTypesResponse>(
  'nodeTypes/fetchNodeTypes',
  async () => {
    const response = await getNodeTypes();
    return response;
  }
);

const nodeTypesSlice = createSlice({
  name: 'nodeTypes',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNodeTypes.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchNodeTypes.fulfilled, (state, action: PayloadAction<NodeTypesResponse>) => {
        state.status = 'succeeded';
        state.data = action.payload.schema;
        state.metadata = action.payload.metadata;
      })
      .addCase(fetchNodeTypes.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'An error occurred';
      });
  },
});

// Helper function to find metadata in the nested structure
const findMetadataInCategory = (
  metadata: Record<string, NodeMetadata[]> | null,
  nodeType: string,
  path: string
): any | null => {
  if (!metadata) return null;

  // Get categories dynamically from metadata object
  const categories = Object.keys(metadata);
  for (const category of categories) {
    const nodes = metadata[category];
    if (!nodes) continue;

    // Find the node in the category
    const node = nodes.find((node: NodeMetadata) => node.name === nodeType);
    if (!node) continue;

    // Navigate the remaining path
    const remainingPath = path.split('.');
    let current: any = node;

    for (const part of remainingPath) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;  // Path not found
      }
    }

    return current;  // Return the found metadata
  }

  return null;  // Node type not found in any category
};

export const selectPropertyMetadata = (state: RootState, propertyPath: string): any | null => {
  if (!propertyPath) return null;

  // Split path into nodeType and remaining path
  const [nodeType, ...pathParts] = propertyPath.split('.');
  const remainingPath = pathParts.join('.');
  return findMetadataInCategory(state.nodeTypes.metadata, nodeType, remainingPath);
};

export default nodeTypesSlice.reducer;
