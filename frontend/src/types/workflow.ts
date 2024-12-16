import { BaseNodeConfig, NodeData, WorkflowNode as BaseWorkflowNode, DynamicNodeConfig } from './nodes/base';
import { CustomEdge } from './reactflow';

export interface WorkflowNodeCoordinates {
  x: number;
  y: number;
}

export type WorkflowNode = BaseWorkflowNode<DynamicNodeConfig>;

export interface TestInput {
  id?: string;
  initial_inputs: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: CustomEdge[];
  links?: CustomEdge[];  // For backward compatibility
  test_inputs?: TestInput[];
  name?: string;
  description?: string;
  input_variables?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  key?: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
  created_at: string;
  updated_at: string;
}

export interface WorkflowData {
  id?: string;
  key?: string;
  name?: string;
  description?: string;
  definition: WorkflowDefinition;
  created_at?: string;
  updated_at?: string;
}

export interface Template {
  file_name: string;
  name: string;
  description: string;
  features: string[];
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
}

export interface ApiKey {
  name: string;
  value: string;
}

export interface RunOutputData {
  status: string;
  output: Record<string, unknown>;
}

export interface RunOutputs {
  [key: string]: RunOutputData;
}

export interface RunStatusResponse {
  id: string;
  workflow_id: string;
  workflow_version: WorkflowData;
  status: string;
  start_time?: string;
  end_time?: string;
  tasks: Record<string, unknown>[];
  outputs?: RunOutputs;
  output_file_id?: string;
  results?: Record<string, unknown>;
}
