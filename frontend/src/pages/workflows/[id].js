import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import FlowCanvas from '../../components/canvas/FlowCanvas';
import Header from '../../components/Header'; // Import the Header component
import { PersistGate } from 'redux-persist/integration/react'; // Import PersistGate
import { persistor } from '../../store/store'; // Import the persistor
import { getWorkflow } from '../../utils/api';
import { useDispatch } from 'react-redux'; // Import useDispatch from react-redux
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchNodeTypes } from '../../store/nodeTypesSlice';
import { setTestInputs } from '../../store/flowSlice'; // Import setTestInputs action

const WorkflowPage = () => {

    const dispatch = useDispatch(); // Initialize dispatch
    const router = useRouter();
    const { id } = router.query; // Access the dynamic route parameter
    const [workflowData, setWorkflowData] = useState(null);

    useEffect(() => {
        dispatch(fetchNodeTypes());
        const fetchWorkflow = async () => {
            try {
                const data = await getWorkflow(id);
                setWorkflowData(data);

                // Dispatch the test inputs to the Redux store
                if (data.definition && data.definition.test_inputs) {
                    dispatch(setTestInputs(data.definition.test_inputs));
                }
            } catch (error) {
                console.error('Error fetching workflow:', error);
            }
        };

        if (id) {
            fetchWorkflow();
        }
    }, [id, dispatch]); // Add dispatch to the dependency array

    if (!workflowData) {
        return <LoadingSpinner />;
    }

    return (
        <PersistGate loading={null} persistor={persistor}>
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                <Header activePage="workflow" style={{ position: 'sticky', top: 0, zIndex: 10 }} />
                <div style={{ flexGrow: 1 }}>
                    <FlowCanvas workflowData={workflowData} workflowID={id} />
                </div>
            </div>
        </PersistGate>
    );
};

export default WorkflowPage;