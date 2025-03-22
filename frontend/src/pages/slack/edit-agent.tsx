import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Alert, Card, CardBody, Input, Switch, Checkbox, Divider, Textarea, Tooltip } from '@heroui/react'
import { ArrowLeft, Info } from 'lucide-react'
import { Icon } from '@iconify/react'
import { WorkflowResponse } from '@/types/api_types/workflowSchemas'
import { getWorkflows, SlackAgent, getSlackAgents, updateTriggerConfig, associateWorkflow } from '@/utils/api'
import Head from 'next/head'
import { Select, SelectItem } from '@heroui/react'

export default function EditSlackAgent() {
    const router = useRouter()
    const { id } = router.query
    const agentId = id ? parseInt(id as string, 10) : null

    const [agent, setAgent] = useState<SlackAgent | null>(null)
    const [workflows, setWorkflows] = useState<WorkflowResponse[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Form state
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("")
    const [triggerEnabled, setTriggerEnabled] = useState(true)
    const [triggerOnMention, setTriggerOnMention] = useState(true)
    const [triggerOnDM, setTriggerOnDM] = useState(true)
    const [triggerOnChannel, setTriggerOnChannel] = useState(false)
    const [keywords, setKeywords] = useState<string>("")

    // Fetch agent and workflows
    useEffect(() => {
        const fetchData = async () => {
            if (!agentId) return

            setIsLoading(true)
            try {
                const [agentsResponse, workflowsResponse] = await Promise.all([
                    getSlackAgents(true), // Force refresh to ensure latest data
                    getWorkflows(1)
                ])

                // Find the specific agent
                const foundAgent = agentsResponse.find(a => a.id === agentId)
                if (!foundAgent) {
                    setError("Agent not found")
                    return
                }

                // Log agent data for debugging
                console.log('Loaded agent data:', {
                    id: foundAgent.id,
                    name: foundAgent.name,
                    workflow_id: foundAgent.workflow_id,
                    type: typeof foundAgent.workflow_id
                })

                setAgent(foundAgent)

                // Initialize form state - ensure workflow_id is a string
                const workflowId = foundAgent.workflow_id ? String(foundAgent.workflow_id) : ""
                console.log('Setting initial workflow ID:', workflowId)
                setSelectedWorkflowId(workflowId)

                setTriggerEnabled(foundAgent.trigger_enabled)
                setTriggerOnMention(foundAgent.trigger_on_mention)
                setTriggerOnDM(foundAgent.trigger_on_direct_message)
                setTriggerOnChannel(foundAgent.trigger_on_channel_message)
                setKeywords((foundAgent.trigger_keywords || []).join(", "))

                // Sort and log workflows
                const sortedWorkflows = [...workflowsResponse].sort(
                    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )

                console.log('Available workflows:', sortedWorkflows.map(w => ({
                    id: w.id,
                    name: w.name,
                    matches: w.id === workflowId
                })))

                setWorkflows(sortedWorkflows)
                setError(null)
            } catch (err) {
                console.error('Error fetching data:', err)
                setError('Failed to load agent information. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }

        if (agentId) {
            fetchData()
        }
    }, [agentId])

    // Update selectedWorkflowId if agent changes
    useEffect(() => {
        if (agent && agent.workflow_id) {
            const workflowId = String(agent.workflow_id);
            console.log(`Agent workflow_id changed to ${workflowId}, updating selected workflow`);
            setSelectedWorkflowId(workflowId);
        }
    }, [agent?.workflow_id]);

    const handleSave = async () => {
        if (!agent) return

        setIsSaving(true)
        setError(null)
        setSuccess(null)

        try {
            // Parse keywords for the trigger config
            const keywordsArray = keywords
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0)

            // First handle workflow association if changed
            if (selectedWorkflowId !== agent.workflow_id) {
                console.log(`Associating workflow: Selected ID=${selectedWorkflowId} (${typeof selectedWorkflowId}), Current ID=${agent.workflow_id} (${typeof agent.workflow_id})`)

                // Convert both IDs to strings for proper comparison
                const currentId = agent.workflow_id ? String(agent.workflow_id) : ""
                const newId = selectedWorkflowId ? String(selectedWorkflowId) : ""

                if (newId !== currentId) {
                    try {
                        await associateWorkflow(agent.id, selectedWorkflowId)
                        console.log('Workflow association completed successfully')

                        // Add a small delay to ensure the backend has time to process the association
                        await new Promise(resolve => setTimeout(resolve, 500))
                    } catch (workflowError) {
                        console.error('Error associating workflow:', workflowError)
                        setError('Failed to associate workflow. Please try again.')
                        setIsSaving(false)
                        return
                    }
                } else {
                    console.log('Workflow IDs are the same after string conversion, skipping association API call')
                }
            } else {
                console.log('Workflow ID unchanged, skipping association')
            }

            // Then update trigger configuration
            console.log(`Updating trigger config for agent ${agent.id}...`)
            await updateTriggerConfig(agent.id, {
                trigger_enabled: triggerEnabled,
                trigger_on_mention: triggerOnMention,
                trigger_on_direct_message: triggerOnDM,
                trigger_on_channel_message: triggerOnChannel,
                trigger_keywords: keywordsArray
            })

            // Add a small delay before fetching updated agent data
            await new Promise(resolve => setTimeout(resolve, 300))

            // Refresh agent data
            console.log('Fetching updated agent data...')
            const agents = await getSlackAgents(true)
            const updatedAgent = agents.find(a => a.id === agent.id)

            if (updatedAgent) {
                console.log('Updated agent data:', updatedAgent)
                setAgent(updatedAgent)

                // Verify if workflow was associated correctly
                const expectedId = selectedWorkflowId ? String(selectedWorkflowId) : "";
                const actualId = updatedAgent.workflow_id ? String(updatedAgent.workflow_id) : "";

                console.log('Workflow ID verification:', {
                    expected: expectedId,
                    actual: actualId,
                    match: expectedId === actualId
                });

                if (expectedId && expectedId !== actualId) {
                    console.warn('Workflow association may not have been saved properly')
                    setSuccess("Agent updated, but workflow association may require another attempt.")
                } else {
                    setSuccess("Agent updated successfully!")
                }
            } else {
                console.error('Could not find updated agent in response')
                setSuccess("Agent updated, but couldn't refresh latest data.")
            }
        } catch (err) {
            console.error('Error updating agent:', err)
            setError('Failed to update agent settings. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancel = () => {
        router.push('/dashboard')
    }

    return (
        <>
            <Head>
                <title>Edit Slack Agent | Pyspur</title>
            </Head>

            <div className="min-h-screen bg-background p-6">
                <div className="max-w-[1000px] mx-auto">
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

                    {success && (
                        <Alert color="success" className="mb-6">
                            {success}
                        </Alert>
                    )}

                    {isLoading ? (
                        <div className="flex justify-center items-center h-[500px]">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                                <p className="text-default-500">Loading agent information...</p>
                            </div>
                        </div>
                    ) : agent ? (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <Icon icon="solar:bot-bold" width={24} />
                                <h1 className="text-2xl font-bold">Edit Slack Agent: {agent.name}</h1>
                            </div>

                            <Card className="mb-6">
                                <CardBody className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-semibold mb-4">Agent Information</h2>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <Input
                                                isReadOnly
                                                label="Agent Name"
                                                value={agent.name}
                                                description="Name cannot be changed after creation"
                                            />
                                            <Input
                                                isReadOnly
                                                label="Workspace"
                                                value={agent.slack_team_name}
                                                description="Connected Slack workspace"
                                            />
                                        </div>
                                    </div>

                                    <Divider />

                                    <div>
                                        <h2 className="text-xl font-semibold mb-4">Workflow Association</h2>
                                        <div className="space-y-4">
                                            <Select
                                                label="Associated Workflow"
                                                placeholder="Select a workflow"
                                                value={selectedWorkflowId}
                                                onChange={(e) => {
                                                    console.log("Selected workflow changed to:", e.target.value);
                                                    setSelectedWorkflowId(e.target.value);
                                                }}
                                                description="The workflow this agent will run when triggered"
                                                selectedKeys={selectedWorkflowId ? [selectedWorkflowId] : []}
                                            >
                                                <SelectItem key="none" value="">
                                                    No workflow (select one)
                                                </SelectItem>
                                                {workflows
                                                    .filter(workflow => agent?.spur_type ?
                                                        workflow.definition.spur_type === agent.spur_type : true)
                                                    .map((workflow) => {
                                                        console.log(`Workflow option: id=${workflow.id}, name=${workflow.name}, ${agent?.workflow_id === workflow.id ? '(MATCHES CURRENT)' : ''}`);
                                                        return (
                                                            <SelectItem key={workflow.id} value={workflow.id}>
                                                                {workflow.name}
                                                            </SelectItem>
                                                        );
                                                    })}
                                            </Select>

                                            {!selectedWorkflowId && (
                                                <Alert color="warning">
                                                    This agent won't be able to respond until you select a workflow.
                                                </Alert>
                                            )}
                                        </div>
                                    </div>

                                    <Divider />

                                    <div>
                                        <div className="flex items-center gap-2 mb-4">
                                            <h2 className="text-xl font-semibold">Trigger Settings</h2>
                                            <Tooltip content="Configure what events will trigger this agent to respond">
                                                <Info className="w-4 h-4 text-default-400" />
                                            </Tooltip>
                                        </div>

                                        <div className="p-6 border border-default-200 rounded-lg">
                                            <div className="flex justify-between items-center mb-6">
                                                <div>
                                                    <h4 className="text-md font-medium">Enable Triggers</h4>
                                                    <p className="text-sm text-default-500">Agent will respond to messages when enabled</p>
                                                </div>
                                                <Switch
                                                    size="lg"
                                                    isSelected={triggerEnabled}
                                                    onValueChange={setTriggerEnabled}
                                                />
                                            </div>

                                            <Divider className="my-4" />

                                            <div className="space-y-4 mt-6">
                                                <h4 className="text-md font-medium">Response Conditions</h4>
                                                <p className="text-sm text-default-500 mb-2">
                                                    Select when your agent should respond:
                                                </p>

                                                <div className="grid gap-4 mt-2">
                                                    <div className={`p-4 border rounded-lg ${!triggerEnabled ? 'opacity-50' : ''}`}>
                                                        <Checkbox
                                                            isSelected={triggerOnMention}
                                                            onValueChange={setTriggerOnMention}
                                                            isDisabled={!triggerEnabled}
                                                            size="lg"
                                                        >
                                                            <div className="ml-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium">@mentions</span>
                                                                </div>
                                                                <p className="text-sm text-default-500">
                                                                    Agent will respond when mentioned in channels with @AgentName
                                                                </p>
                                                            </div>
                                                        </Checkbox>
                                                    </div>

                                                    <div className={`p-4 border rounded-lg ${!triggerEnabled ? 'opacity-50' : ''}`}>
                                                        <Checkbox
                                                            isSelected={triggerOnDM}
                                                            onValueChange={setTriggerOnDM}
                                                            isDisabled={!triggerEnabled}
                                                            size="lg"
                                                        >
                                                            <div className="ml-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium">Direct Messages</span>
                                                                </div>
                                                                <p className="text-sm text-default-500">
                                                                    Agent will respond to all messages sent directly to it
                                                                </p>
                                                            </div>
                                                        </Checkbox>
                                                    </div>

                                                    <div className={`p-4 border rounded-lg ${!triggerEnabled ? 'opacity-50' : ''}`}>
                                                        <Checkbox
                                                            isSelected={triggerOnChannel}
                                                            onValueChange={setTriggerOnChannel}
                                                            isDisabled={!triggerEnabled}
                                                            size="lg"
                                                        >
                                                            <div className="ml-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium">Channel Messages</span>
                                                                </div>
                                                                <p className="text-sm text-default-500">
                                                                    Agent will respond to all messages in channels it's added to
                                                                </p>
                                                            </div>
                                                        </Checkbox>
                                                    </div>
                                                </div>

                                                <div className={`mt-6 ${!triggerEnabled ? 'opacity-50' : ''}`}>
                                                    <Input
                                                        label="Keyword Triggers (Optional)"
                                                        placeholder="help, support, question (comma-separated)"
                                                        value={keywords}
                                                        onChange={(e) => setKeywords(e.target.value)}
                                                        isDisabled={!triggerEnabled}
                                                        description="Agent will respond when these keywords are mentioned in messages"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>

                            <div className="flex gap-3 justify-end">
                                <Button
                                    variant="flat"
                                    onPress={handleCancel}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="primary"
                                    onPress={handleSave}
                                    isLoading={isSaving}
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center items-center h-[300px]">
                            <Alert color="danger">
                                Agent not found or invalid ID.
                            </Alert>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}