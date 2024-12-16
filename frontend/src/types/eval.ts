import { WorkflowData } from './workflow';

export interface EvalRunResponse {
  run_id: string;
  eval_name: string;
  workflow_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  results?: Record<string, any>;
  workflow_version?: WorkflowData;
}

export interface EvalRun extends EvalRunResponse {
  results?: {
    accuracy: number;
    subset_metrics?: {
      default?: {
        per_example_results: Array<{
          input: Record<string, any>;
          output: Record<string, any>;
          expected: Record<string, any>;
          correct: boolean;
        }>;
      };
    };
  };
}

export interface EvalItem {
  name: string;
  description: string;
  type: string;
  num_samples: number;
  paper_link?: string;
}

export interface EvalRunData {
  run_id: string;
  results: string | null;
  status: string;
}

export interface EvalCardRunProps {
  workflowId: string;
  numSamples: number;
  outputVariable: string;
}
