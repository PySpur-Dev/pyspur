import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getRunStatus, startRun, getWorkflow } from '../utils/api';
import { updateNodeData, setProjectName } from '../store/flowSlice';
import { RootState } from '../store/store';
import { WorkflowNode } from '../types/nodes/base';
import { RunStatusResponse, TestInput } from '../types/workflow';

// Import clearCanvas from flowSlice
import { clearCanvas } from '../store/flowSlice';

const useWorkflow = () => {
    const dispatch = useDispatch();
    const nodes = useSelector((state: RootState) => state.flow.nodes);
    const workflowId = useSelector((state: RootState) => state.flow.workflowId);
    const inputNodeValues = useSelector((state: RootState) => state.flow.inputNodeValues);
    const projectName = useSelector((state: RootState) => state.flow.projectName);
    const [isRunning, setIsRunning] = useState(false);

    const updateWorkflowStatus = async (runID: string): Promise<void> => {
        const checkStatusInterval = setInterval(async () => {
            try {
                const statusResponse: RunStatusResponse = await getRunStatus(runID);
                const outputs = statusResponse.outputs || {};
                console.log('Status Response:', statusResponse);

                if (outputs) {
                    Object.entries(outputs).forEach(([nodeId, data]) => {
                        const node = nodes.find((node: WorkflowNode) => node.id === nodeId);
                        if (data && node) {
                            dispatch(updateNodeData({
                                id: nodeId,
                                data: {
                                    status: data.status || 'unknown',
                                    run: { ...node.data.run, ...data }
                                }
                            }));
                        }
                    });
                }

                if (statusResponse.status !== 'RUNNING') {
                    setIsRunning(false);
                    clearInterval(checkStatusInterval);
                }
            } catch (error) {
                console.error('Error fetching workflow status:', error);
                clearInterval(checkStatusInterval);
            }
        }, 10000);
    };

    const handleRunWorkflow = async (): Promise<void> => {
        try {
            if (!workflowId) {
                console.error('No workflow ID available');
                return;
            }

            console.log('Input Node Values:', inputNodeValues);

            // Set all nodes' status to 'pending'
            nodes.forEach((node: WorkflowNode) => {
                dispatch(updateNodeData({ id: node.id, data: { status: 'pending' } }));
            });

            const test_inputs: TestInput = {
                initial_inputs: {
                    "node_1731066766087": { "user_message": "Give me weather in London" }
                }
            };
            const result = await startRun(workflowId, test_inputs, null, 'interactive');

            setIsRunning(true);
            updateWorkflowStatus(result.id);

        } catch (error) {
            console.error('Error starting workflow run:', error);
        }
    };

    const handleDownloadWorkflow = async (): Promise<void> => {
        try {
            if (!workflowId) {
                console.error('No workflow ID available');
                return;
            }

            const workflow = await getWorkflow(workflowId);
            const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName.replace(/\s+/g, '_')}.json`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading workflow:', error);
        }
    };

    return {
        isRunning,
        handleRunWorkflow,
        handleDownloadWorkflow,
        handleClearCanvas: () => {
            if (window.confirm('Are you sure you want to clear the canvas? This action cannot be undone.')) {
                dispatch(clearCanvas());
            }
        },
        handleProjectNameChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            dispatch(setProjectName(e.target.value));
        }
    };
};

export default useWorkflow;
