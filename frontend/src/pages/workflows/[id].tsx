import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Header from '../../components/Header';
import { WorkflowNode } from '../../types/nodes/base';
import { CustomEdge } from '../../types/reactflow';
import { TestInput } from '../../types/workflow';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from '../../store/store';
import { getWorkflow } from '../../utils/api';
import { useDispatch } from 'react-redux';
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchNodeTypes } from '../../store/nodeTypesSlice';
import { setTestInputs } from '../../store/flowSlice';
import { AppDispatch } from '../../store/store';

// Use dynamic import for FlowCanvas to avoid SSR issues
const FlowCanvas = dynamic(() => import('../../components/canvas/FlowCanvas'), {
  ssr: false,
});

interface WorkflowData {
  id: string;
  name?: string;
  description?: string;
  definition: {
    nodes: WorkflowNode[];
    edges: CustomEdge[];
    test_inputs?: TestInput[];
  };
}

const WorkflowPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { id } = router.query;
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null);

  useEffect(() => {
    dispatch(fetchNodeTypes());
    const fetchWorkflow = async () => {
      try {
        if (typeof id !== 'string') return;
        const data = await getWorkflow(id);
        setWorkflowData(data);

        if (data.definition?.test_inputs) {
          dispatch(setTestInputs(data.definition.test_inputs));
        }
      } catch (error) {
        console.error('Error fetching workflow:', error);
      }
    };

    if (id) {
      fetchWorkflow();
    }
  }, [id, dispatch]);

  if (!workflowData) {
    return <LoadingSpinner />;
  }

  return (
    <PersistGate loading={null} persistor={persistor}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header activePage="workflow" />
        <div style={{ flexGrow: 1 }}>
          <FlowCanvas workflowData={workflowData} workflowID={id as string} />
        </div>
      </div>
    </PersistGate>
  );
};

export default WorkflowPage;
