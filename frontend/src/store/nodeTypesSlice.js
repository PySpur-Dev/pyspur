import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getNodeTypes } from '../utils/api';

const initialState = {
  raw: null,
  data: null, // This will store the schema object
  metadata: null, // This will store the metadata
  status: 'idle',
  error: null,
};

export const fetchNodeTypes = createAsyncThunk('nodeTypes/fetchNodeTypes', async () => {
  const response = await getNodeTypes();
  return response; // Now returns { raw,schema, metadata }
});

const nodeTypesSlice = createSlice({
  name: 'nodeTypes',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNodeTypes.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchNodeTypes.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.raw = action.payload.raw;
        state.data = action.payload.schema;
        state.metadata = action.payload.metadata;
      })
      .addCase(fetchNodeTypes.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      });
  },
});

// Helper function to find metadata in the nested structure
const findMetadataInCategory = (metadata, nodeType, path) => {
  if (!metadata) return null;

  // Find which category the node belongs to
  const categories = ['primitives', 'llm', 'python'];
  for (const category of categories) {
    const nodes = metadata[category];
    if (!nodes) continue;

    // Find the node in the category
    const node = nodes.find((node) => node.name === nodeType);
    if (!node) continue;
    // Navigate the remaining path
    const remainingPath = path.split('.');
    let current = node;

    for (const part of remainingPath) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null; // Path not found
      }
    }

    return current; // Return the found metadata
  }

  return null; // Node type not found in any category
};

export const selectPropertyMetadata = (state, propertyPath) => {
  if (!propertyPath) return null;

  // Split path into nodeType and remaining path
  const [nodeType, ...pathParts] = propertyPath.split('.');
  const remainingPath = pathParts.join('.');
  return findMetadataInCategory(state.nodeTypes.metadata, nodeType, remainingPath);
};

export default nodeTypesSlice.reducer;
