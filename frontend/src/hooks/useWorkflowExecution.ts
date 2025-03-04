import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { updateNodeDataOnly, resetRun } from '../store/flowSlice'
import { getRunStatus, startRun, getWorkflowRuns, validateGoogleAccessToken } from '../utils/api'
import { RootState } from '../store/store'
import store from '../store/store'
import { AlertColor } from '../types/alert'

interface UseWorkflowExecutionProps {
    onAlert: (message: string, color: AlertColor) => void
}

interface WorkflowRun {
    id: string
    status: string
    start_time?: string
    end_time?: string
}

export const useWorkflowExecution = ({ onAlert }: UseWorkflowExecutionProps) => {
    const dispatch = useDispatch()
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const workflowId = useSelector((state: RootState) => state.flow.workflowID)
    const [isRunning, setIsRunning] = useState<boolean>(false)
    const [completionPercentage, setCompletionPercentage] = useState<number>(0)
    const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false)

    // Create array to track all intervals for this run
    const statusIntervals = useRef<NodeJS.Timeout[]>([])

    const updateWorkflowStatus = async (runID: string): Promise<void> => {
        // Clear any existing intervals
        statusIntervals.current.forEach((interval) => clearInterval(interval))

        let currentStatusInterval = setInterval(async () => {
            try {
                const statusResponse = await getRunStatus(runID)
                const tasks = statusResponse.tasks

                if (statusResponse.percentage_complete !== undefined) {
                    setCompletionPercentage(statusResponse.percentage_complete)
                }

                // Check if any task is paused
                const hasPausedTask = tasks.some(task => task.status === 'PAUSED')
                const hasRunningTask = tasks.some(task => task.status === 'RUNNING')
                const hasFailedTask = tasks.some(task => task.status === 'FAILED')
                const hasPendingTask = tasks.some(task => task.status === 'PENDING')

                if (tasks.length > 0) {
                    tasks.forEach((task) => {
                        const nodeId = task.node_id
                        let node = nodes.find((node) => node.id === nodeId || node.data.title === nodeId)
                        if (!node) {
                            // find the node by title in nodeConfigs
                            const state = store.getState()
                            const correspondingNodeId = Object.keys(state.flow.nodeConfigs).find(
                                (key) => state.flow.nodeConfigs[key].title === nodeId
                            )
                            if (correspondingNodeId) {
                                node = nodes.find((node) => node.id === correspondingNodeId)
                            }
                        }
                        if (!node) {
                            return
                        }
                        const output_values = task.outputs || {}
                        const nodeTaskStatus = task.status

                        // Handle subworkflow outputs if they exist
                        if (task.subworkflow_output) {
                            Object.entries(task.subworkflow_output).forEach(([subNodeId, outputs]) => {
                                const subNode = nodes.find(
                                    (node) => node.id === subNodeId || node.data.title === subNodeId
                                )
                                if (subNode) {
                                    dispatch(
                                        updateNodeDataOnly({
                                            id: subNode.id,
                                            data: {
                                                run: outputs,
                                                taskStatus: 'COMPLETED',
                                            },
                                        })
                                    )
                                }
                            })
                        }

                        if (node) {
                            dispatch(
                                updateNodeDataOnly({
                                    id: node.id,
                                    data: {
                                        run: { ...output_values },
                                        error: task.error || null,
                                        taskStatus: nodeTaskStatus,
                                    },
                                })
                            )
                        }
                    })
                }

                // Update running state and show appropriate messages
                if (hasPausedTask) {
                    setIsRunning(true) // Keep running state true when paused
                    if (!hasRunningTask) {
                        onAlert('Workflow run paused for human intervention.', 'warning')
                        // Stop polling when paused with no running tasks
                        statusIntervals.current.forEach((interval) => clearInterval(interval))
                        clearInterval(currentStatusInterval)
                    }
                } else if (statusResponse.status !== 'RUNNING') {
                    setIsRunning(false)
                    setCompletionPercentage(0)
                    // Clear all intervals
                    statusIntervals.current.forEach((interval) => clearInterval(interval))
                    clearInterval(currentStatusInterval)

                    if (hasFailedTask) {
                        if (tasks.some((task) => task.status === 'COMPLETED')) {
                            onAlert('Workflow ran with some failed tasks.', 'warning')
                        } else {
                            onAlert('Workflow run failed.', 'danger')
                        }
                    } else {
                        onAlert('Workflow run completed.', 'success')
                    }
                }

                // Stop polling if workflow is done or fully paused
                if (!hasRunningTask && (!hasPendingTask || hasPausedTask)) {
                    statusIntervals.current.forEach((interval) => clearInterval(interval))
                    clearInterval(currentStatusInterval)
                }
            } catch (error) {
                console.error('Error fetching workflow status:', error)
                // Clear all intervals
                statusIntervals.current.forEach((interval) => clearInterval(interval))
                clearInterval(currentStatusInterval)
            }
        }, 1000)

        // Track the new interval
        statusIntervals.current.push(currentStatusInterval)
    }

    const executeWorkflow = async (inputValues: Record<string, any>): Promise<void> => {
        if (!workflowId) return

        const hasGoogleSheetsReadNode = nodes.some((node) => node.type === 'GoogleSheetsReadNode')

        if (hasGoogleSheetsReadNode) {
            const response = await validateGoogleAccessToken()
            console.log('Token check response:', response)
            if (!response.is_valid) {
                const baseUrl = window.location.origin
                window.open(`${baseUrl}/google/auth`, '_blank')
                return
            }
        }

        try {
            dispatch(resetRun())
            onAlert('Starting workflow run...', 'default')
            const result = await startRun(workflowId, inputValues, null, 'interactive')
            setIsRunning(true)
            await fetchWorkflowRuns()
            updateWorkflowStatus(result.id)
        } catch (error: any) {
            console.error('Error starting workflow run:', error)
            // Check if this is a model provider error
            const errorDetail = error?.response?.data?.detail
            if (typeof errorDetail === 'string') {
                try {
                    const parsedError = JSON.parse(errorDetail)
                    if (parsedError.type === 'model_provider_error') {
                        // Map error types to alert colors
                        const errorColors: Record<string, AlertColor> = {
                            overloaded: 'warning',
                            rate_limit: 'warning',
                            context_length: 'danger',
                            auth: 'danger',
                            service_unavailable: 'warning',
                            unknown: 'danger',
                        }
                        const color = errorColors[parsedError.error_type] || 'danger'
                        const provider = parsedError.provider.toUpperCase()
                        onAlert(`${provider} Model Error: ${parsedError.message}`, color)
                        return
                    }
                } catch (e) {
                    // Not a JSON error, continue with generic error handling
                }
            }
            onAlert('Error starting workflow run.', 'danger')
        }
    }

    const stopWorkflow = (): void => {
        setIsRunning(false)
        setCompletionPercentage(0)
        if (statusIntervals.current.length > 0) {
            statusIntervals.current.forEach((interval) => clearInterval(interval))
        }
        onAlert('Workflow run stopped.', 'warning')
    }

    const fetchWorkflowRuns = async () => {
        try {
            const response = await getWorkflowRuns(workflowId)
            setWorkflowRuns(response)
        } catch (error) {
            console.error('Error fetching workflow runs:', error)
        }
    }

    const updateRunStatuses = async () => {
        if (!workflowId) return

        setIsUpdatingStatus(true)
        try {
            // First fetch the latest workflow runs
            const latestRuns = await getWorkflowRuns(workflowId)
            setWorkflowRuns(latestRuns)

            // Then update the status of running/pending runs
            const updatedRuns = await Promise.all(
                latestRuns.map(async (run) => {
                    if (run.status.toLowerCase() === 'running' || run.status.toLowerCase() === 'pending') {
                        const statusResponse = await getRunStatus(run.id)
                        return { ...run, status: statusResponse.status }
                    }
                    return run
                })
            )

            setWorkflowRuns(updatedRuns)
        } catch (error) {
            console.error('Error updating run statuses:', error)
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    useEffect(() => {
        if (workflowId) {
            fetchWorkflowRuns()
        }
    }, [workflowId])

    return {
        isRunning,
        completionPercentage,
        workflowRuns,
        isUpdatingStatus,
        executeWorkflow,
        stopWorkflow,
        updateRunStatuses,
    }
}
