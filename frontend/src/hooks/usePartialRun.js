import { useState } from 'react';
import { runPartialWorkflow } from '../utils/api';

const usePartialRun = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const executePartialRun = async (workflowId, nodeId, initialInputs, partialOutputs, rerunPredecessors) => {
    console.log('Starting partial run with parameters:', {
      workflowId,
      nodeId,
      initialInputs,
      partialOutputs,
      rerunPredecessors
    });

    setLoading(true);
    setError(null);

    try {
      const data = await runPartialWorkflow(workflowId, nodeId, initialInputs, partialOutputs, rerunPredecessors);
      console.log('Partial run successful, result:', data);
      setResult(data);
      return data;
    } catch (err) {
      console.error('Error during partial run:', err);
      setError(err);
    } finally {
      setLoading(false);
      console.log('Partial run completed');
    }
  };

  return { executePartialRun, loading, error, result };
};

export default usePartialRun;