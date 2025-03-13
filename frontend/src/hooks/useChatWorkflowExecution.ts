import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { resetRun, updateNodeDataOnly } from '../store/flowSlice'
import store, { RootState } from '../store/store'
import { getRunStatus, startRun } from '../utils/api'

interface UseChatWorkflowExecutionProps {
    workflowID?: string
    sessionId?: string | null
}

interface ChatMessage {
    role: string
    message: string
    runId?: string
}

export const useChatWorkflowExecution = ({
    workflowID,
    sessionId: providedSessionId,
}: UseChatWorkflowExecutionProps) => {
    const dispatch = useDispatch()
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const statusIntervals = useRef<NodeJS.Timeout[]>([])
    const [sessionId, setSessionId] = useState<string>(() => {
        // Use provided sessionId if available, otherwise generate a new one
        return providedSessionId || `chat_session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    })

    // Update sessionId if providedSessionId changes
    useEffect(() => {
        if (providedSessionId) {
            setSessionId(providedSessionId)
        }
    }, [providedSessionId])

    // Clear existing intervals when unmounting
    useEffect(() => {
        return () => {
            statusIntervals.current.forEach((interval) => clearInterval(interval))
            statusIntervals.current = []
        }
    }, [])

    // Function to update node status based on tasks
    const updateNodeStatuses = useCallback(
        (tasks: any[]) => {
            if (tasks.length === 0) return

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

                if (!node) return

                const output_values = task.outputs || {}
                const nodeTaskStatus = task.status

                // Handle subworkflow outputs if they exist
                if (task.subworkflow_output) {
                    Object.entries(task.subworkflow_output).forEach(([subNodeId, outputs]) => {
                        const subNode = nodes.find((node) => node.id === subNodeId || node.data.title === subNodeId)
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
        },
        [nodes, dispatch]
    )

    // Function to execute a workflow with a chat message
    const executeWorkflow = useCallback(
        async (message: string): Promise<ChatMessage | null> => {
            if (!workflowID) {
                setError('No workflow connected')
                return null
            }

            try {
                setIsLoading(true)
                setError(null)

                // Clear any existing intervals
                statusIntervals.current.forEach((interval) => clearInterval(interval))

                // Reset node states before starting a new run
                dispatch(resetRun())

                // Start the workflow run with the message as input and session ID
                // Format the inputs according to what the backend expects for chat workflows
                const result = await startRun(
                    workflowID,
                    {
                        input_node: {
                            user_message: message,
                            session_id: sessionId,
                            // Optional empty message history array
                            message_history: [],
                        },
                    },
                    null,
                    'interactive'
                )

                const runID = result.id

                // Now we need to poll for results
                return new Promise((resolve) => {
                    const interval = setInterval(async () => {
                        try {
                            const statusResponse = await getRunStatus(runID)
                            const tasks = statusResponse.tasks

                            // Update node statuses to visualize execution
                            updateNodeStatuses(tasks)

                            // Check if the workflow is completed or has failed
                            if (statusResponse.status === 'COMPLETED' || statusResponse.status === 'FAILED') {
                                // Clear the interval
                                clearInterval(interval)
                                const indexOfInterval = statusIntervals.current.indexOf(interval)
                                if (indexOfInterval > -1) {
                                    statusIntervals.current.splice(indexOfInterval, 1)
                                }

                                // Find the output node in the workflow definition
                                const outputNode = statusResponse.workflow_version.definition.nodes.find(
                                    (node) => node.node_type === 'OutputNode'
                                )

                                if (!outputNode) {
                                    setIsLoading(false)
                                    setError('No output node found in workflow')
                                    resolve({
                                        role: 'assistant',
                                        message: 'Error: No output node found in workflow',
                                    })
                                    return
                                }

                                // Find the corresponding task for the output node
                                const outputTask = tasks.find(
                                    (task) =>
                                        task.status === 'COMPLETED' && task.node_id === outputNode.id && task.outputs
                                )

                                if (outputTask && outputTask.outputs) {
                                    // For chat workflows, we expect the OutputNode to have assistant_message
                                    const outputContent =
                                        outputTask.outputs.assistant_message || JSON.stringify(outputTask.outputs)

                                    // Return the assistant message from the workflow output
                                    setIsLoading(false)
                                    resolve({
                                        role: 'assistant',
                                        message:
                                            typeof outputContent === 'string'
                                                ? outputContent
                                                : JSON.stringify(outputContent),
                                        runId: runID,
                                    })
                                } else if (statusResponse.status === 'FAILED') {
                                    // Handle workflow failure
                                    const failedTask = tasks.find((task) => task.status === 'FAILED')
                                    const errorMessage = failedTask?.error || 'Workflow execution failed'

                                    setIsLoading(false)
                                    setError(errorMessage)
                                    resolve({
                                        role: 'assistant',
                                        message: `Error: ${errorMessage}`,
                                        runId: runID,
                                    })
                                } else {
                                    // Handle case where workflow completed but no valid output was found
                                    setIsLoading(false)
                                    setError('Workflow completed but no response was generated')
                                    resolve({
                                        role: 'assistant',
                                        message: "Sorry, I couldn't generate a response.",
                                        runId: runID,
                                    })
                                }
                            }
                        } catch (error) {
                            console.error('Error checking workflow status:', error)
                            clearInterval(interval)
                            const indexOfInterval = statusIntervals.current.indexOf(interval)
                            if (indexOfInterval > -1) {
                                statusIntervals.current.splice(indexOfInterval, 1)
                            }

                            setIsLoading(false)
                            setError('Error checking workflow status')
                            resolve({
                                role: 'assistant',
                                message: 'Sorry, an error occurred while processing your message.',
                            })
                        }
                    }, 1000)

                    // Store the interval reference
                    statusIntervals.current.push(interval)
                })
            } catch (error: any) {
                console.error('Error executing chat workflow:', error)
                setIsLoading(false)
                setError(error?.message || 'Failed to execute workflow')
                return {
                    role: 'assistant',
                    message: 'Sorry, an error occurred while processing your message.',
                }
            }
        },
        [workflowID, sessionId, dispatch, updateNodeStatuses]
    )

    // Cleanup function
    const cleanup = useCallback(() => {
        statusIntervals.current.forEach((interval) => clearInterval(interval))
        statusIntervals.current = []
    }, [])

    return {
        isLoading,
        error,
        executeWorkflow,
        cleanup,
        sessionId,
    }
}
