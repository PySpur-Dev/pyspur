import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { getNodeTypes } from '../utils/api';
import { RootState } from './store';
import { NodeTypes, NodeData, NodeType, BaseNodeConfig, NodeTypesByCategory } from '../types/nodes/base';
import { NodeTypeRegistry } from '../types/nodes/custom';

export type { NodeType };

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

interface IfElseNodeConfig extends BaseNodeConfig {
  branches: BranchCondition[];
}

export interface NodeMetadata extends Omit<NodeType, 'config'> {
  config: BaseNodeConfig & {
    few_shot_examples?: Array<Record<string, string>>;
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

interface NodeTypesState {
  data: NodeTypesByCategory;
  metadata: NodeTypeRegistry;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export interface NodeTypeMetadata extends NodeData {
  config: BaseNodeConfig & {
    branches?: BranchCondition[];
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    [key: string]: unknown;
  };
  type: NodeTypes;
}

const initialState: NodeTypesState = {
  data: {} as NodeTypesByCategory,
  metadata: {},
  status: 'idle',
  error: null,
};

export const fetchNodeTypes = createAsyncThunk(
  'nodeTypes/fetchNodeTypes',
  async (_: void, { rejectWithValue }) => {
    try {
      const response = await getNodeTypes();
      return response as { schema: NodeTypesByCategory, metadata: Record<string, unknown> };
    } catch (error) {
      return rejectWithValue(error);
    }
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
      .addCase(fetchNodeTypes.fulfilled, (state, action: PayloadAction<{ schema: NodeTypesByCategory, metadata: Record<string, unknown> }>) => {
        state.status = 'succeeded';
        console.log('Raw node types response in reducer:', action.payload);

        try {
          if (!action.payload || typeof action.payload !== 'object') {
            console.error('Invalid node types response:', action.payload);
            state.status = 'failed';
            state.error = 'Invalid node types response: payload is missing or invalid';
            return;
          }

          const { schema, metadata } = action.payload;

          if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
            const processedSchema: NodeTypesByCategory = {};

            for (const [category, nodes] of Object.entries(schema)) {
              if (!Array.isArray(nodes)) {
                console.warn(`Skipping non-array property ${category} in schema`);
                continue;
              }

              const validNodes = nodes
                .filter(node => {
                  if (!node || typeof node !== 'object' || !node.name) {
                    console.warn(`Skipping invalid node in category ${category}:`, node);
                    return false;
                  }
                  return true;
                })
                .map(node => ({
                  ...node,
                  type: node.type || node.name.toLowerCase(),
                  name: node.name,
                  category,
                  visual_tag: node.visual_tag || {
                    color: '#666',
                    acronym: node.name.substring(0, 2).toUpperCase()
                  }
                }));

              if (validNodes.length > 0) {
                processedSchema[category] = validNodes;
                console.log(`Processed ${validNodes.length} nodes for category ${category}:`, validNodes);
              } else {
                console.warn(`No valid nodes found in category ${category}`);
              }
            }

            state.data = processedSchema;
            console.log('Successfully processed node types:', processedSchema);
          } else {
            console.error('Invalid schema structure:', schema);
            state.error = 'Invalid schema structure';
          }

          if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
            state.metadata = metadata as NodeTypeRegistry;
          }
        } catch (error) {
          console.error('Error processing node types:', error);
          state.status = 'failed';
          state.error = 'Error processing node types schema';
        }
      })
      .addCase(fetchNodeTypes.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'An error occurred';
      });
  },
});

const findMetadataInCategory = (
  metadata: NodeTypeRegistry | null,
  nodeType: string,
  path: string
): unknown | null => {
  if (!metadata) return null;

  const categories = Object.keys(metadata);
  for (const category of categories) {
    const nodes = metadata[category];
    if (!nodes) continue;

    const node = nodes.find((node: NodeType) => node.name === nodeType);
    if (!node) continue;

    const remainingPath = path.split('.');
    let current: unknown = node;

    for (const part of remainingPath) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }

    return current;
  }

  return null;
};

export const selectPropertyMetadata = (state: RootState, propertyPath: string): unknown | null => {
  if (!propertyPath) return null;

  const [nodeType, ...pathParts] = propertyPath.split('.');
  const remainingPath = pathParts.join('.');
  return findMetadataInCategory(state.nodeTypes.metadata, nodeType, remainingPath);
};

export default nodeTypesSlice.reducer;
