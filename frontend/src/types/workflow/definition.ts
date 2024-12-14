import { NodeCoordinates, BaseNodeConfig } from '../nodes/base';

export interface WorkflowNodeDefinition {
  id: string;
  title?: string;
  node_type: string;
  config: BaseNodeConfig;
  coordinates: NodeCoordinates;
}

export interface WorkflowLink {
  source_id: string;
  source_output_key: string;
  target_id: string;
  target_input_key: string;
  selected?: boolean;
}

export interface WorkflowDefinition {
  nodes: WorkflowNodeDefinition[];
  links: WorkflowLink[];
  test_inputs?: Array<Record<string, unknown>>;
  input_variables?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  key?: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
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
