import { useState } from 'react';
import { runPartialWorkflow } from '../utils/api';

interface PartialRunResult {
  // Add specific result type properties based on your API response
  [key: string]: any;
}

interface PartialRunError {
  message: string;
  // Add other error properties as needed
  [key: string]: any;
}

export interface PartialRunParams {
  workflowId: string;
  nodeId: string;
  initialInputs: Record<string, any>;
  partialOutputs: Record<string, any>;
  rerunPredecessors: boolean;
}

const usePartialRun = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PartialRunError | null>(null);
  const [result, setResult] = useState<PartialRunResult | null>(null);

  const executePartialRun = async ({
    workflowId,
    nodeId,
    initialInputs,
    partialOutputs,
    rerunPredecessors
  }: PartialRunParams): Promise<PartialRunResult | undefined> => {


    setLoading(true);
    setError(null);

    try {
      const data = await runPartialWorkflow(workflowId, nodeId, initialInputs, partialOutputs, rerunPredecessors);
      setResult(data);
      return data;
    } catch (err) {
      console.error('Error during partial run:', err);
      const error = err as PartialRunError;
      setError(error);
    } finally {
      setLoading(false);

    }
  };

  return { executePartialRun, loading, error, result };
};

export default usePartialRun;