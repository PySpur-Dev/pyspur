import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateNodeData } from '../../store/flowSlice';
import { getRunStatus } from '../../utils/api';
import { RunStatusResponse } from '../../types/workflow';

interface NodeStatus {
    status: string;
    output: Record<string, unknown>;
}

interface NodeOutputs {
    [key: string]: NodeStatus;
}

interface WorkflowStatusUpdaterProps {
    runID: string;
}

interface RootState {
    flow: {
        nodes: Array<{
            id: string;
            data: Record<string, unknown>;
        }>;
    };
}

const WorkflowStatusUpdater: React.FC<WorkflowStatusUpdaterProps> = ({ runID }) => {
    const dispatch = useDispatch();
    const nodes = useSelector((state: RootState) => state.flow.nodes);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const response = await getRunStatus(runID);
                const outputs = response.outputs as NodeOutputs;

                if (outputs) {
                    // Iterate over the outputs from the backend
                    Object.entries(outputs).forEach(([nodeId, nodeStatus]) => {
                        dispatch(updateNodeData({
                            id: nodeId,
                            data: {
                                status: nodeStatus.status,
                                runoutput: nodeStatus.output
                            }
                        }));
                    });
                }
            } catch (error) {
                console.error('Error fetching workflow status:', error);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [runID, dispatch]);

    return null; // This component doesn't render anything
};

export default WorkflowStatusUpdater;
