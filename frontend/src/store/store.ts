import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import flowReducer from './flowSlice';
import nodeTypesReducer from './nodeTypesSlice';
import type { Node, Edge } from '@xyflow/react';
import { NodeType } from '../types/nodes/base';
import type { NodeMetadata } from './nodeTypesSlice';
import type { FlowState, RootState as StoreRootState } from '../types/store';

// Re-export RootState from store/index.ts
export type { StoreRootState as RootState };

// Define the persist config
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['nodes', 'edges', 'nodeTypes'],
};

const rootReducer = combineReducers({
  flow: flowReducer,
  nodeTypes: nodeTypesReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

// Define store types
export type AppStore = typeof store;
export type AppDispatch = typeof store.dispatch;
export const persistor = persistStore(store);
export default store;
