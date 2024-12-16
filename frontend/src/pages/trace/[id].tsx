import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import RunViewFlowCanvas from '../../components/canvas/RunViewFlowCanvas';
import Header from '../../components/Header';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from '../../store/store';
import { useDispatch } from 'react-redux';
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchNodeTypes } from '../../store/nodeTypesSlice';
import { setTestInputs } from '../../store/flowSlice';
import { getRunStatus } from '../../utils/api';
import { WorkflowData } from '../../types/workflow';
import { AppDispatch } from '../../store/store';

interface RunStatusResponse {
  workflow_id: string;
  workflow_version: WorkflowData;
  outputs?: Record<string, unknown>;
}

const TracePage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { id } = router.query;
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null);
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, unknown>>({});
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchNodeTypes());
    const fetchRun = async () => {
      try {
        if (typeof id !== 'string') return;
        const data = await getRunStatus(id);
        console.log('Run Data:', data);
        setWorkflowId(data.workflow_id);
        setWorkflowData(data.workflow_version);

        if (data.workflow_version?.definition) {
          dispatch(setTestInputs(data.workflow_version.definition.test_inputs || []));
          if (data.outputs) {
            setNodeOutputs(data.outputs);
          }
        }
      } catch (error) {
        console.error('Error fetching run:', error);
      }
    };
    if (id) {
      fetchRun();
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
          <RunViewFlowCanvas
            workflowData={workflowData}
            nodeOutputs={nodeOutputs}
            workflowID={workflowId || ''}
          />
        </div>
      </div>
    </PersistGate>
  );
};

export default TracePage;
