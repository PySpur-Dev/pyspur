import { Edge, Node } from '@xyflow/react';
import { WorkflowNode, NodeType, DynamicNodeConfig } from '../nodes/base';

export interface FlowState {
  nodes: WorkflowNode[];
  edges: Edge[];
  selectedNodes: string[];
  selectedEdges: string[];
  copiedNodes: WorkflowNode[];
  copiedEdges: Edge[];
  nodeTypes: Record<string, NodeType[]>;
  isRunning: boolean;
  runStatus: string;
  runOutput: Record<string, unknown>;
  runError: string | null;
  runId: string | null;
  workflowId: string | null;
  workflowVersion: string | null;
  workflowName: string;
  workflowDescription: string;
  workflowTags: string[];
  sidebarWidth: number;
  selectedNode: string | null;
  projectName: string;
  workflowInputVariables: Record<string, unknown>;
  testInputs: Record<string, unknown>;
  inputNodeValues: Record<string, unknown>;
  history: {
    past: Array<{nodes: WorkflowNode[]; edges: Edge[]}>;
    future: Array<{nodes: WorkflowNode[]; edges: Edge[]}>;
  };
}

export interface BranchCondition {
  conditions: Array<{
    variable: string;
    operator: string;
    value: string;
    logicalOperator?: "AND" | "OR";
  }>;
}

export type NodeConfig = DynamicNodeConfig;

export interface RootState {
  flow: FlowState;
  nodeTypes: {
    data: Record<string, NodeType[]>;
    metadata: Record<string, NodeType[]>;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
  };
}
