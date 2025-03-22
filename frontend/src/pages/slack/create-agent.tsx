import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Alert } from '@heroui/react'
import { ArrowLeft } from 'lucide-react'
import { SlackAgentWizard } from '@/components/slack'
import { WorkflowResponse } from '@/types/api_types/workflowSchemas'
import { getWorkflows, SlackAgent, associateWorkflow } from '@/utils/api'
import Head from 'next/head'

export default function CreateSlackAgent() {
    const router = useRouter()
    const [workflows, setWorkflows] = useState<WorkflowResponse[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isAssociating, setIsAssociating] = useState(false)

    useEffect(() => {
        const fetchWorkflows = async () => {
            setIsLoading(true)
            try {
                const data = await getWorkflows(1)
                // Sort workflows by updated_at in descending order (newest first)
                const sortedWorkflows = [...data].sort(
                    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )
                setWorkflows(sortedWorkflows)
                setError(null)
            } catch (err) {
                console.error('Error fetching workflows:', err)
                setError('Failed to load workflows. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }

        fetchWorkflows()
    }, [])

    const handleAgentCreated = async (agent: SlackAgent, selectedWorkflowId?: string) => {
        // If a workflow was selected, ensure it's properly associated
        if (selectedWorkflowId && (!agent.workflow_id || agent.workflow_id !== selectedWorkflowId)) {
            try {
                setIsAssociating(true)

                // Make an explicit call to associate the workflow with the agent
                console.log(`Explicitly associating workflow ${selectedWorkflowId} with agent ${agent.id}`)
                await associateWorkflow(agent.id, selectedWorkflowId)

                // Brief delay to ensure backend processes the association
                await new Promise(resolve => setTimeout(resolve, 500))
            } catch (error) {
                console.error('Error associating workflow with agent:', error)
            } finally {
                setIsAssociating(false)
            }
        }

        // Redirect back to dashboard after creation
        router.push('/dashboard')
    }

    const handleCancel = () => {
        router.push('/dashboard')
    }

    return (
        <>
            <Head>
                <title>Create Slack Agent | Pyspur</title>
            </Head>

            <div className="min-h-screen bg-background p-6">
                <div className="max-w-[1200px] mx-auto">
                    <Button
                        variant="light"
                        startContent={<ArrowLeft size={18} />}
                        onPress={handleCancel}
                        className="mb-6"
                    >
                        Back to Dashboard
                    </Button>

                    {error && (
                        <Alert color="danger" className="mb-6">
                            {error}
                        </Alert>
                    )}

                    {isLoading ? (
                        <div className="flex justify-center items-center h-[500px]">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                                <p className="text-default-500">Loading workflows...</p>
                            </div>
                        </div>
                    ) : isAssociating ? (
                        <div className="flex justify-center items-center h-[500px]">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                                <p className="text-default-500">Finalizing agent setup...</p>
                            </div>
                        </div>
                    ) : (
                        <SlackAgentWizard
                            workflows={workflows}
                            onCreated={handleAgentCreated}
                            onCancel={handleCancel}
                            isStandalone={true}
                        />
                    )}
                </div>
            </div>
        </>
    )
}