import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import RunViewFlowCanvas from '@/components/canvas/RunViewFlowCanvas';
import Header from '../../components/Header';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from '../../store/store';
import { useDispatch } from 'react-redux';
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchNodeTypes } from '../../store/nodeTypesSlice';
import { setTestInputs } from '../../store/flowSlice';
import { getRunStatus } from '../../utils/api';
import { AppDispatch } from '../../store/store';
import { rolloutWorkflowDefinition } from '../../utils/subworkflowUtils';

import { RunResponse } from '@/types/api_types/runSchemas';
import { WorkflowDefinition, WorkflowResponse } from '@/types/api_types/workflowSchemas';

const TracePage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { id } = router.query;
  const [runData, setRunData] = useState<RunResponse | null>(null);
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, any>>({});
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowData, setWorkflowData] = useState<{name: string, definition: WorkflowDefinition} | null>(null);

  useEffect(() => {
    dispatch(fetchNodeTypes());
    const fetchRun = async () => {
      try {
        if (typeof id !== 'string') return;
        const data = await getRunStatus(id);
        setWorkflowId(data.workflow_id);
        setRunData(data);

        if (data.workflow_version?.definition) {
          dispatch(setTestInputs(data.workflow_version.definition.test_inputs));

          // Roll out the workflow definition if tasks are available
          const {rolledOutDefinition, outputs} = data.tasks ?
            rolloutWorkflowDefinition({
              workflowDefinition: data.workflow_version.definition,
              tasks: data.tasks
            }) :
            {rolledOutDefinition: data.workflow_version.definition, outputs: data.outputs};

          setWorkflowData({
            name: data.workflow_version.name,
            definition: rolledOutDefinition,
          });

          if (outputs) {
            setNodeOutputs(outputs);
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
        <Header activePage="trace" />
        <div style={{ flexGrow: 1 }}>
          <RunViewFlowCanvas workflowData={workflowData} nodeOutputs={nodeOutputs} workflowID={workflowId} />
        </div>
      </div>
    </PersistGate>
  );
};

export default TracePage;