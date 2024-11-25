import { combineReducers, configureStore } from "@reduxjs/toolkit";
import * as Redux from "react-redux";
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";
import { flowReducer } from "./slices";

const persistedReducer = persistReducer(
  {
    key: "root",
    storage,
  },
  combineReducers({
    flow: flowReducer,
  })
);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
      },
    }),
});

export * from "./slices";
export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;

export const useDispatch = Redux.useDispatch.withTypes<AppDispatch>();
export const useSelector = Redux.useSelector.withTypes<RootState>();
