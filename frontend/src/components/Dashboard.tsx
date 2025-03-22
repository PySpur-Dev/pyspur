import {
    Accordion,
    AccordionItem,
    Alert,
    Button,
    Chip,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Radio,
    RadioGroup,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow,
    getKeyValue,
    useDisclosure,
    Badge,
    Tooltip,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { formatDistanceToNow } from 'date-fns'
import { Upload } from 'lucide-react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useSelector } from 'react-redux'

import { PausedWorkflowResponse, ResumeActionRequest } from '@/types/api_types/pausedWorkflowSchemas'
import { RunResponse } from '@/types/api_types/runSchemas'
import {
    SpurType,
    WorkflowCreateRequest,
    WorkflowDefinition,
    WorkflowResponse,
} from '@/types/api_types/workflowSchemas'

import { RootState } from '../store/store'
import { Template } from '../types/workflow'
import {
    ApiKey,
    cancelWorkflow,
    createWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    getApiKey,
    getTemplates,
    getWorkflowRuns,
    getWorkflows,
    instantiateTemplate,
    listApiKeys,
    listPausedWorkflows,
    takePauseAction,
    getSlackAgents,
    SlackAgent,
    associateWorkflow,
    fetchSlackSetupInfo,
    deleteSlackAgent,
    startSocketMode,
    stopSocketMode,
    getSocketModeStatus
} from '../utils/api'
import TemplateCard from './cards/TemplateCard'
import SpurTypeChip from './chips/SpurTypeChip'
import HumanInputModal from './modals/HumanInputModal'
import WelcomeModal from './modals/WelcomeModal'
import SettingsModal from './modals/SettingsModal'
import {
    SlackSetupGuide,
    WorkflowAssociationModal,
    SlackAgentWizard,
    SlackTestConnection,
} from './slack'
import SlackAgentEditor from './slack/SlackAgentEditor'

// Calendly Widget Component
const CalendlyWidget: React.FC = () => {
    useEffect(() => {
        // Check if script already exists
        const existingScript = document.querySelector(
            'script[src="https://assets.calendly.com/assets/external/widget.js"]'
        )
        let scriptElement: HTMLScriptElement | null = null

        if (!existingScript) {
            // Load Calendly widget script only if it doesn't exist
            scriptElement = document.createElement('script')
            scriptElement.src = 'https://assets.calendly.com/assets/external/widget.js'
            scriptElement.async = true
            document.body.appendChild(scriptElement)
        }

        const initializeWidget = () => {
            if ((window as any).Calendly) {
                ;(window as any).Calendly.initBadgeWidget({
                    url: 'https://calendly.com/d/cnf9-57m-bv3/pyspur-founders',
                    text: 'Talk to the founders',
                    color: '#1a1a1a',
                    textColor: '#ffffff',
                })
            }
        }

        // Initialize widget once script is loaded or if it already exists
        if (existingScript) {
            initializeWidget()
        } else if (scriptElement) {
            scriptElement.onload = initializeWidget
        }

        return () => {
            // Remove the widget element if it exists
            const widgetElements = document.querySelectorAll('.calendly-badge-widget')
            widgetElements.forEach((element) => element.remove())

            // Remove the inline widget if it exists
            const inlineWidgets = document.querySelectorAll('.calendly-inline-widget')
            inlineWidgets.forEach((element) => element.remove())

            // Remove any Calendly popups if they exist
            const popupWidgets = document.querySelectorAll('.calendly-overlay')
            popupWidgets.forEach((element) => element.remove())

            // Clean up the script only if we added it
            if (scriptElement && document.body.contains(scriptElement)) {
                document.body.removeChild(scriptElement)
            }

            // Reset the Calendly object
            if ((window as any).Calendly) {
                delete (window as any).Calendly
            }
        }
    }, [])

    return null
}

// Slack Setup Guide component
const Dashboard: React.FC = () => {
    const router = useRouter()
    const [workflows, setWorkflows] = useState<WorkflowResponse[]>([])
    const [templates, setTemplates] = useState<Template[]>([])
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(true)
    const [showWelcome, setShowWelcome] = useState(false)
    const hasSeenWelcome = useSelector((state: RootState) => state.userPreferences.hasSeenWelcome)
    const [workflowRuns, setWorkflowRuns] = useState<Record<string, RunResponse[]>>({})
    const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true)
    const [highlightedWorkflowId, setHighlightedWorkflowId] = useState<string | null>(null)
    const [workflowPage, setWorkflowPage] = useState(1)
    const [hasMoreWorkflows, setHasMoreWorkflows] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [pausedWorkflows, setPausedWorkflows] = useState<PausedWorkflowResponse[]>([])
    const [selectedWorkflow, setSelectedWorkflow] = useState<PausedWorkflowResponse | null>(null)
    const [isHumanInputModalOpen, setIsHumanInputModalOpen] = useState(false)
    const [isLoadingPaused, setIsLoadingPaused] = useState(false)
    const [alertMessage, setAlertMessage] = useState<string | null>(null)
    const [alertColor, setAlertColor] = useState<'success' | 'danger' | 'warning' | 'default'>('default')
    const [showAlert, setShowAlert] = useState(false)
    const { isOpen: isNewSpurModalOpen, onOpen: onOpenNewSpurModal, onClose: onCloseNewSpurModal } = useDisclosure()
    const [selectedSpurType, setSelectedSpurType] = useState<SpurType>(SpurType.WORKFLOW)
    const [slackAgents, setSlackAgents] = useState<SlackAgent[]>([])
    const [isLoadingSlackAgents, setIsLoadingSlackAgents] = useState(false)
    const [slackConfigured, setSlackConfigured] = useState(false)
    const [showSlackSetupGuide, setShowSlackSetupGuide] = useState(false)
    const [showConfigErrorModal, setShowConfigErrorModal] = useState(false)
    const [slackSetupInfo, setSlackSetupInfo] = useState<any>(null)
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
    const [settingsActiveTab, setSettingsActiveTab] = useState<'appearance' | 'api-keys'>('api-keys')
    const [selectedSlackAgent, setSelectedSlackAgent] = useState<SlackAgent | null>(null)
    const [showWorkflowAssociationModal, setShowWorkflowAssociationModal] = useState(false)
    const [selectedAgentForDetail, setSelectedAgentForDetail] = useState<SlackAgent | null>(null)
    const [testConnectionAgent, setTestConnectionAgent] = useState<SlackAgent | null>(null);
    const [showTestConnectionInputModal, setShowTestConnectionInputModal] = useState(false);
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [showSlackAgentWizard, setShowSlackAgentWizard] = useState(false);
    const [showAgentEditorModal, setShowAgentEditorModal] = useState(false);

    // Function to show alerts
    const onAlert = (message: string, color: 'success' | 'danger' | 'warning' | 'default' = 'default') => {
        setAlertMessage(message)
        setAlertColor(color)
        setShowAlert(true)

        // Auto-hide the alert after 5 seconds
        setTimeout(() => {
            setShowAlert(false)
        }, 5000)
    }

    useEffect(() => {
        const fetchWorkflows = async () => {
            setIsLoadingWorkflows(true)
            try {
                const workflows = await getWorkflows(1)
                const runsMap = await Promise.all(workflows.map((workflow) => fetchWorkflowRuns(workflow.id))).then(
                    (runs) => {
                        const map: Record<string, RunResponse[]> = {}
                        workflows.forEach((workflow, i) => {
                            map[workflow.id] = runs[i] || []
                        })
                        return map
                    }
                )
                // Sort workflows by updated_at in descending order (newest first)
                const sortedWorkflows = [...workflows].sort(
                    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )
                setWorkflows(sortedWorkflows as WorkflowResponse[])
                setShowWelcome(!hasSeenWelcome && workflows.length === 0)
                setWorkflowRuns(runsMap)
                setHasMoreWorkflows(workflows.length === 10)
            } catch (error) {
                console.error('Error fetching workflows:', error)
            } finally {
                setIsLoadingWorkflows(false)
            }
        }

        fetchWorkflows()
    }, [hasSeenWelcome])

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const templates = await getTemplates()
                setTemplates(templates)
            } catch (error) {
                console.error('Error fetching templates:', error)
            }
        }

        fetchTemplates()
    }, [])

    useEffect(() => {
        const fetchApiKeys = async () => {
            try {
                setIsLoadingApiKeys(true)
                const keys = await listApiKeys()
                const newApiKeys: ApiKey[] = []
                for (const key of keys) {
                    const value = await getApiKey(key)
                    newApiKeys.push({ name: key, value: value.value })
                }
                setApiKeys(newApiKeys)
            } catch (error) {
                console.error('Error fetching API keys:', error)
            } finally {
                setIsLoadingApiKeys(false)
            }
        }

        fetchApiKeys()
    }, [])

    useEffect(() => {
        const fetchPausedWorkflows = async () => {
            setIsLoadingPaused(true)
            try {
                const paused = await listPausedWorkflows()
                setPausedWorkflows(paused)
            } catch (error) {
                console.error('Error fetching paused workflows:', error)
            } finally {
                setIsLoadingPaused(false)
            }
        }

        fetchPausedWorkflows()
    }, [])

    // Add a new effect to refresh agents on page focus or return
    useEffect(() => {
        // Function to refresh Slack agents
        const refreshSlackAgents = async () => {
            console.log('Refreshing Slack agents')
            setIsLoadingSlackAgents(true)
            try {
                const agents = await getSlackAgents(true) // Force refresh to get latest data

                // Log agent data for debugging
                console.log('Refreshed agents:', agents.map(a => ({
                    id: a.id,
                    name: a.name,
                    workflow_id: a.workflow_id,
                    type: typeof a.workflow_id,
                    spur_type: a.spur_type,
                    has_bot_token: a.has_bot_token,
                    has_user_token: a.has_user_token
                })))

                setSlackAgents(agents)
                setSlackConfigured(agents.length > 0)

                // If we have a currently selected agent for the detail modal, update it
                if (selectedAgentForDetail) {
                    const updatedAgent = agents.find(a => a.id === selectedAgentForDetail.id)
                    if (updatedAgent) {
                        setSelectedAgentForDetail(updatedAgent)
                    }
                }
            } catch (error) {
                console.error('Error refreshing Slack agents:', error)
            } finally {
                setIsLoadingSlackAgents(false)
            }
        }

        // Initial fetch of agents
        refreshSlackAgents()

        // Listen for router events
        const handleRouteChange = (url: string, { shallow }: { shallow: boolean }) => {
            // If returning to dashboard, refresh agents
            if (url === '/dashboard' && !shallow) {
                setTimeout(() => refreshSlackAgents(), 500) // Small delay to ensure backend state is updated
            }
        }

        // Listen for focus events
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshSlackAgents()
            }
        }

        // Add event listeners
        router.events.on('routeChangeComplete', handleRouteChange)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Clean up event listeners
        return () => {
            router.events.off('routeChangeComplete', handleRouteChange)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [router.events])

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const columns = [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'spur_type', label: 'Type' },
        { key: 'action', label: 'Action' },
        { key: 'recentRuns', label: 'Recent Runs' },
        { key: 'updated_at', label: 'Last Modified' },
    ]

    const fetchWorkflowRuns = async (workflowId: string) => {
        try {
            const runs = await getWorkflowRuns(workflowId)
            return runs.slice(0, 5)
        } catch (error) {
            console.error('Error fetching workflow runs:', error)
        }
    }

    const handleEditClick = (workflow: WorkflowResponse) => {
        router.push({
            pathname: `/workflows/${workflow.id}`,
        })
    }

    const handleNewWorkflowClick = async () => {
        onOpenNewSpurModal()
    }

    const handleCreateNewSpur = async () => {
        try {
            const uniqueName = `New ${selectedSpurType === SpurType.CHATBOT ? 'Chatbot' : 'Workflow'} ${new Date().toLocaleString()}`
            const newWorkflow: WorkflowCreateRequest = {
                name: uniqueName,
                description: '',
                definition: {
                    nodes: [],
                    links: [],
                    test_inputs: [],
                    spur_type: selectedSpurType,
                },
            }

            const createdWorkflow = await createWorkflow(newWorkflow)
            onCloseNewSpurModal()
            router.push(`/workflows/${createdWorkflow.id}`)
        } catch (error) {
            console.error('Error creating new workflow:', error)
            onAlert('Failed to create new spur', 'danger')
        }
    }

    const handleImportWorkflowClick = async () => {
        try {
            const fileInput = document.createElement('input')
            fileInput.type = 'file'
            fileInput.accept = 'application/json'

            fileInput.onchange = async (event: Event) => {
                const target = event.target as HTMLInputElement
                const file = target.files?.[0]
                if (!file) {
                    alert('No file selected. Please try again.')
                    return
                }

                const reader = new FileReader()
                reader.onload = async (e: ProgressEvent<FileReader>) => {
                    try {
                        const result = e.target?.result
                        if (typeof result !== 'string') return

                        const jsonContent: WorkflowCreateRequest = JSON.parse(result)
                        const uniqueName = `Imported Spur ${new Date().toLocaleString()}`

                        const newWorkflow: WorkflowCreateRequest = {
                            name: uniqueName,
                            description: jsonContent.description,
                            definition: jsonContent.definition as WorkflowDefinition,
                        }
                        const createdWorkflow = await createWorkflow(newWorkflow)
                        router.push(`/workflows/${createdWorkflow.id}`)
                    } catch (error) {
                        console.error('Error processing the JSON file:', error)
                        alert('Failed to import workflow. Please ensure the file is a valid JSON.')
                    }
                }
                reader.readAsText(file)
            }
            fileInput.click()
        } catch (error) {
            console.error('Error importing workflow:', error)
        }
    }

    const handleUseTemplate = async (template: Template) => {
        try {
            const newWorkflow = await instantiateTemplate(template)
            router.push(`/workflows/${newWorkflow.id}`)
        } catch (error) {
            console.error('Error using template:', error)
        }
    }

    const handleDeleteClick = async (workflow: WorkflowResponse) => {
        if (window.confirm(`Are you sure you want to delete workflow "${workflow.name}"?`)) {
            try {
                await deleteWorkflow(workflow.id)
                setWorkflows((prevWorkflows) => prevWorkflows.filter((w) => w.id !== workflow.id))
            } catch (error) {
                console.error('Error deleting workflow:', error)
                alert('Failed to delete workflow. Please try again.')
            }
        }
    }

    const handleDuplicateClick = async (workflow: WorkflowResponse) => {
        try {
            const duplicatedWorkflow = await duplicateWorkflow(workflow.id)
            setWorkflows((prevWorkflows) => [duplicatedWorkflow, ...prevWorkflows])
            setHighlightedWorkflowId(duplicatedWorkflow.id)
            setTimeout(() => {
                setHighlightedWorkflowId(null)
            }, 2000)
        } catch (error) {
            console.error('Error duplicating workflow:', error)
            alert('Failed to duplicate workflow. Please try again.')
        }
    }

    const handlePreviousRunClick = (runId: string) => {
        window.open(`/trace/${runId}`, '_blank')
    }

    const handleLoadMore = async () => {
        setIsLoadingMore(true)
        try {
            const nextPage = workflowPage + 1
            const moreWorkflows = await getWorkflows(nextPage)

            if (moreWorkflows.length > 0) {
                const runsMap = await Promise.all(moreWorkflows.map((workflow) => fetchWorkflowRuns(workflow.id))).then(
                    (runs) => {
                        const map: Record<string, RunResponse[]> = {}
                        moreWorkflows.forEach((workflow, i) => {
                            map[workflow.id] = runs[i] || []
                        })
                        return map
                    }
                )

                setWorkflows((prev) => {
                    // Merge previous and new workflows, then sort by updated_at
                    const combined = [...prev, ...moreWorkflows]
                    return combined.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                })
                setWorkflowRuns((prev) => ({ ...prev, ...runsMap }))
                setWorkflowPage(nextPage)
                setHasMoreWorkflows(moreWorkflows.length === 10)
            } else {
                setHasMoreWorkflows(false)
            }
        } catch (error) {
            console.error('Error loading more workflows:', error)
        } finally {
            setIsLoadingMore(false)
        }
    }

    const handleHumanInputSubmit = async (
        action: 'APPROVE' | 'DECLINE' | 'OVERRIDE',
        inputData: Record<string, any>,
        comments: string
    ) => {
        if (!selectedWorkflow) return

        try {
            // Log the workflow object structure for debugging
            console.log('Selected workflow:', selectedWorkflow)
            console.log('Input data:', inputData)

            // Get run ID - this should always be available
            const runId = selectedWorkflow.run.id

            // Get workflow ID directly from the run object (not needed for takePauseAction but keeping for logs)
            const workflowId = selectedWorkflow.run.workflow_id

            console.log('Workflow ID:', workflowId)
            console.log('Run ID:', runId)

            if (runId) {
                try {
                    // Create the action request object
                    const actionRequest: ResumeActionRequest = {
                        inputs: inputData,
                        user_id: 'current-user',
                        action,
                        comments,
                    }

                    // Call takePauseAction with the request
                    await takePauseAction(runId, actionRequest)

                    // Show success message
                    onAlert(`Workflow resumed with action: ${action}`, 'success')

                    // Close the modal
                    setIsHumanInputModalOpen(false)
                    setSelectedWorkflow(null)
                } catch (resumeError) {
                    console.error('Error resuming workflow:', resumeError)
                    onAlert('Failed to resume workflow', 'danger')
                }
            } else {
                console.error('Cannot resume workflow: Run ID is missing or invalid')
                onAlert('Cannot resume workflow: missing run ID', 'danger')
            }

            // Refresh paused workflows
            const paused = await listPausedWorkflows()
            setPausedWorkflows(paused)
        } catch (error) {
            console.error('Error submitting human input:', error)
            onAlert('Error submitting human input', 'danger')
        }
    }

    // Handle quick actions (approve/decline) directly from the dashboard
    const handleQuickAction = async (workflow: PausedWorkflowResponse, action: 'APPROVE' | 'DECLINE') => {
        try {
            const runId = workflow.run.id

            if (runId) {
                // Create a simple action request with empty inputs and comments
                const actionRequest: ResumeActionRequest = {
                    inputs: {},
                    user_id: 'current-user',
                    action,
                    comments: `Quick ${action.toLowerCase()} from dashboard`,
                }

                // Call takePauseAction with the request
                await takePauseAction(runId, actionRequest)

                // Show success message
                onAlert(`Workflow ${action.toLowerCase()}d successfully`, 'success')

                // Refresh paused workflows
                const paused = await listPausedWorkflows()
                setPausedWorkflows(paused)
            } else {
                console.error('Cannot perform action: Run ID is missing or invalid')
                onAlert('Cannot perform action: missing run ID', 'danger')
            }
        } catch (error) {
            console.error(`Error performing ${action} action:`, error)
            onAlert(`Failed to ${action.toLowerCase()} workflow`, 'danger')
        }
    }

    // Handle cancellation of a workflow
    const handleCancelWorkflow = async (workflow: PausedWorkflowResponse) => {
        try {
            const runId = workflow.run.id

            if (runId) {
                if (window.confirm(`Are you sure you want to cancel this workflow? This action cannot be undone.`)) {
                    // Call the cancelWorkflow API
                    await cancelWorkflow(runId)

                    // Show success message
                    onAlert('Workflow canceled successfully', 'success')

                    // Refresh paused workflows
                    const paused = await listPausedWorkflows()
                    setPausedWorkflows(paused)
                }
            } else {
                console.error('Cannot cancel workflow: Run ID is missing or invalid')
                onAlert('Cannot cancel workflow: missing run ID', 'danger')
            }
        } catch (error) {
            console.error('Error canceling workflow:', error)
            onAlert('Failed to cancel workflow', 'danger')
        }
    }

    const onJSONDrop = useCallback(
        (acceptedFiles: File[]) => {
            const file = acceptedFiles[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = async (e) => {
                try {
                    const result = e.target?.result
                    if (typeof result !== 'string') return
                    const jsonContent = JSON.parse(result)
                    const uniqueName = `Imported Spur ${new Date().toLocaleString()}`
                    const newWorkflow: WorkflowCreateRequest = {
                        name: uniqueName,
                        description: jsonContent.description,
                        definition: jsonContent.definition as WorkflowDefinition,
                    }
                    const createdWorkflow = await createWorkflow(newWorkflow)
                    router.push(`/workflows/${createdWorkflow.id}`)
                } catch (error) {
                    console.error('Error processing dropped JSON file:', error)
                    alert('Failed to import workflow. Please ensure the file is a valid JSON.')
                }
            }
            reader.readAsText(file)
        },
        [router]
    )

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: onJSONDrop,
        accept: { 'application/json': ['.json'] },
        noClick: true,
        noKeyboard: true,
    })

    const handleGoToSettings = () => {
        // Open settings modal with API keys tab pre-selected
        setSettingsActiveTab('api-keys')
        setIsSettingsModalOpen(true)
        setShowConfigErrorModal(false) // Close the error modal
    }

    const callHandleConnectToSlack = async () => {
        setShowSlackAgentWizard(true);
    }

    const callHandleShowSlackSetup = async () => {
        try {
            const info = await fetchSlackSetupInfo()
            setSlackSetupInfo(info)
            setShowSlackSetupGuide(true)
        } catch (error) {
            console.error('Error preparing Slack setup:', error)
            onAlert('Failed to prepare Slack setup. Please try again.', 'danger')
        }
    }

    const handleSlackTokenConfigured = async () => {
        // Refresh the Slack agents after token is configured
        try {
            const agents = await getSlackAgents()

            // If no agents exist, show the agent wizard
            if (agents.length === 0) {
                console.log('No agents found after token configuration, showing agent wizard...')
                setShowSlackAgentWizard(true)
                onAlert('Slack token configured successfully! Let&apos;s create your first agent.', 'success')
            } else {
                setSlackAgents(agents)

                // Show success message
                onAlert('Slack token configured successfully!', 'success')

                // Show the workflow association modal with the first agent
                setSelectedSlackAgent(agents[0])

                // Force the modal to show
                console.log('Forcing workflow association modal to show after token config')
                setShowWorkflowAssociationModal(true)

                // Also try with a timeout as a fallback
                setTimeout(() => {
                    if (!showWorkflowAssociationModal) {
                        console.log('Showing workflow association modal via timeout after token config')
                        setShowWorkflowAssociationModal(true)
                    }
                }, 1000)
            }
        } catch (error) {
            console.error('Error fetching Slack agents:', error)
            onAlert('Slack token configured, but there was an error setting up Slack integration.', 'warning')
        }
    }

    const handleAssociateWorkflow = async (agentId: number, workflowId: string) => {
        try {
            console.log(`Dashboard - Associating workflow: Agent ID=${agentId}, Workflow ID=${workflowId} (${typeof workflowId})`);

            // Call the API to associate the workflow with the agent
            const updatedAgent = await associateWorkflow(agentId, workflowId);
            onAlert?.('Workflow associated successfully', 'success');

            // Add a small delay and then force a refresh of the agents list
            setTimeout(async () => {
                console.log('Refreshing agents after association...');
                const refreshedAgents = await getSlackAgents(true); // Force refresh
                setSlackAgents(refreshedAgents);
            }, 500);

            // Scroll to the Slack section to show the updated agent
            const slackSection = document.getElementById('slack-section')
            if (slackSection) {
                slackSection.scrollIntoView({ behavior: 'smooth' })
            }
        } catch (error) {
            console.error('Error associating workflow:', error)
            onAlert?.('Failed to associate workflow', 'danger');
            throw error
        }
    }

    // Debug log when agents change
    useEffect(() => {
        if (slackAgents.length > 0) {
            console.log('Slack agents updated:', slackAgents.map(a => ({
                id: a.id,
                name: a.name,
                workflow_id: a.workflow_id,
                workflow_id_type: typeof a.workflow_id,
                spur_type: a.spur_type,
                spur_type_type: typeof a.spur_type
            })));
        }
        return () => {}; // Empty cleanup function
    }, [slackAgents]);

    // Debug log when workflow association modal state changes
    useEffect(() => {
        console.log('Workflow association modal state:', {
            showWorkflowAssociationModal,
            selectedSlackAgent
        })
    }, [showWorkflowAssociationModal, selectedSlackAgent])

    const handleAgentCreated = (newAgent: SlackAgent) => {
        // Update the agents list with the new agent
        setSlackAgents(prevAgents => [...prevAgents, newAgent])

        // Show success message
        onAlert('Slack agent created successfully!', 'success')

        // No need to close modal since we're using a dedicated page
    }

    // Helper function to log agent information
    const logAgentInfo = (agent: SlackAgent) => {
        console.log(`Agent ${agent.id} (${agent.name}) spur_type:`, agent.spur_type, typeof agent.spur_type);
        return null; // Return null to avoid rendering anything
    };

    const handleOpenAgentEditor = (agent: SlackAgent) => {
        setSelectedAgentForDetail(agent)
        setShowAgentEditorModal(true)
    }

    // Add a dedicated function to refresh agents after token updates
    const refreshAgentsAfterTokenUpdate = async () => {
        console.log('Dashboard - refreshAgentsAfterTokenUpdate called')
        try {
            // Get the updated agents list - force a fresh fetch from the backend
            console.log('Fetching updated agents with force refresh')
            const agents = await getSlackAgents(true)
            console.log('Received updated agents:', agents.map(a => ({
                id: a.id,
                name: a.name,
                has_bot_token: a.has_bot_token,
                has_user_token: a.has_user_token,
                has_app_token: a.has_app_token,
                token_flags_type: {
                    bot: typeof a.has_bot_token,
                    user: typeof a.has_user_token,
                    app: typeof a.has_app_token
                }
            })))

            // Ensure token flags are properly set as booleans
            const processedAgents = agents.map(agent => ({
                ...agent,
                has_bot_token: Boolean(agent.has_bot_token),
                has_user_token: Boolean(agent.has_user_token),
                has_app_token: Boolean(agent.has_app_token)
            }))

            // Update the agents state
            setSlackAgents(processedAgents)

            // Also update the selected agent for detail if we have one
            if (selectedAgentForDetail) {
                console.log('Updating selected agent for detail:', selectedAgentForDetail.id)
                const updatedAgent = processedAgents.find(a => a.id === selectedAgentForDetail.id)
                if (updatedAgent) {
                    console.log('Found updated agent:', {
                        id: updatedAgent.id,
                        has_bot_token: updatedAgent.has_bot_token,
                        has_user_token: updatedAgent.has_user_token,
                        has_app_token: updatedAgent.has_app_token
                    })
                    setSelectedAgentForDetail(updatedAgent)
                } else {
                    console.warn('Could not find updated agent with ID:', selectedAgentForDetail.id)
                }
            }

            // Show success message
            onAlert('Token configuration updated successfully', 'success')
        } catch (error) {
            console.error('Error refreshing agents after token update:', error)
            onAlert('Token updated, but unable to refresh agents list', 'warning')
        }
    }

    // Add a function to handle deleting a Slack agent
    const handleDeleteAgent = async (agent: SlackAgent) => {
        try {
            const success = await deleteSlackAgent(agent.id, onAlert)
            if (success) {
                // Update the agents list by removing this agent
                setSlackAgents(prevAgents => prevAgents.filter(a => a.id !== agent.id))
            }
        } catch (error) {
            console.error('Error deleting agent:', error)
            onAlert('Failed to delete agent', 'danger')
        }
    }

    // Handler for when an agent is created in the wizard
    const handleAgentCreatedFromWizard = (newAgent: SlackAgent, workflowId?: string) => {
        // Add the new agent to the list
        setSlackAgents(prev => [...prev, newAgent])

        // Close the wizard modal
        setShowSlackAgentWizard(false)

        // Show success message
        onAlert('Slack agent created successfully!', 'success')

        // If the agent is associated with a workflow, we don't need to show the workflow modal
        if (workflowId || newAgent.workflow_id) {
            console.log('Agent already has a workflow associated:', workflowId || newAgent.workflow_id)
        } else {
            // If not, select it for workflow association
            setSelectedSlackAgent(newAgent)
            setShowWorkflowAssociationModal(true)
        }
    }

    // Add this function to handle the socket mode toggle
    const handleSocketModeToggle = async (agent: SlackAgent, isActive: boolean, updateAgents: React.Dispatch<React.SetStateAction<SlackAgent[]>>) => {
        try {
            if (!agent.has_bot_token) {
                return {
                    success: false,
                    message: 'Bot token required for Socket Mode'
                };
            }

            if (isActive) {
                // Stop socket mode
                const response = await stopSocketMode(agent.id);

                // Check if the response contains an error
                if ('error' in response && response.error === true) {
                    return {
                        success: false,
                        message: response.message || 'Failed to stop Socket Mode'
                    };
                }

                // Update agent in the list
                updateAgents((prevAgents) =>
                    prevAgents.map(a => a.id === agent.id
                        ? { ...a, socket_mode_enabled: false }
                        : a
                    )
                );

                return {
                    success: true,
                    message: 'Socket Mode stopped successfully'
                };
            } else {
                // Check if the agent has an app token before starting socket mode
                if (!agent.has_app_token) {
                    return {
                        success: false,
                        message: 'App-level token (xapp-) required for Socket Mode. Configure it in the agent settings.'
                    };
                }

                // Start socket mode
                const response = await startSocketMode(agent.id);

                // Check if the response contains an error
                if ('error' in response && response.error === true) {
                    return {
                        success: false,
                        message: response.message || 'Failed to start Socket Mode'
                    };
                }

                // Update agent in the list
                updateAgents((prevAgents) =>
                    prevAgents.map(a => a.id === agent.id
                        ? { ...a, socket_mode_enabled: true }
                        : a
                    )
                );

                return {
                    success: true,
                    message: 'Socket Mode started successfully'
                };
            }
        } catch (error) {
            console.error('Error toggling socket mode:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error toggling socket mode'
            };
        }
    };

    return (
        <div {...getRootProps()} className="relative flex flex-col gap-2 max-w-7xl w-full mx-auto pt-2 px-6">
            <input {...getInputProps()} />
            {isDragActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg z-50 transition-all duration-300 animate-in fade-in">
                    <Upload className="w-16 h-16 text-primary mb-4" />
                    <p className="text-primary text-xl font-bold">Drop workflow JSON file here</p>
                    <p className="text-primary/80 text-sm mt-2">Release to import your workflow</p>
                </div>
            )}
            <Head>
                <link href="https://assets.calendly.com/assets/external/widget.css" rel="stylesheet" />
            </Head>

            {/* Alert message */}
            {showAlert && alertMessage && (
                <Alert className="mb-4" variant="solid" color={alertColor} onClose={() => setShowAlert(false)}>
                    {alertMessage}
                </Alert>
            )}

            <CalendlyWidget />
            <WelcomeModal isOpen={showWelcome} onClose={() => setShowWelcome(false)} />
            <div>
                {/* Dashboard Header */}
                <header className="mb-6 flex w-full items-center flex-col gap-2">
                    {!isLoadingApiKeys &&
                        (apiKeys.length === 0 || apiKeys.every((key) => !key.value || key.value === '')) && (
                            <div className="w-full">
                                <Alert
                                    variant="bordered"
                                    className="mb-2"
                                    startContent={<Icon icon="lucide:alert-triangle" width={16} />}
                                >
                                    No API keys have been set. Please configure your API keys in the settings to use the
                                    application.
                                </Alert>
                            </div>
                        )}
                    <div className="flex w-full items-center">
                        <div className="flex flex-col max-w-fit" id="dashboard-title">
                            <h1 className="text-lg font-bold text-default-900 lg:text-2xl">Dashboard</h1>
                            <p className="text-small text-default-400 lg:text-medium">Manage your spurs</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2" id="new-workflow-entries">
                            <Button
                                className="bg-foreground text-background dark:bg-foreground/90 dark:text-background/90"
                                startContent={
                                    <Icon className="flex-none text-background/60" icon="lucide:plus" width={16} />
                                }
                                onPress={handleNewWorkflowClick}
                            >
                                New Spur
                            </Button>
                            <Button
                                className="bg-foreground text-background dark:bg-foreground/90 dark:text-background/90"
                                startContent={
                                    <Icon className="flex-none text-background/60" icon="lucide:upload" width={16} />
                                }
                                onPress={handleImportWorkflowClick}
                            >
                                Import Spur (or drop JSON file)
                            </Button>
                        </div>
                    </div>
                </header>

                {/* Wrap sections in Accordion */}
                <Accordion
                    defaultExpandedKeys={new Set(['workflows', 'templates', 'human-tasks', 'slack-agents'])}
                    selectionMode="multiple"
                >
                    <AccordionItem
                        key="workflows"
                        aria-label="Recent Spurs"
                        title={<h3 className="text-xl font-semibold">Recent Spurs</h3>}
                    >
                        {isLoadingWorkflows ? (
                            <div className="flex justify-center p-4">
                                <Spinner size="lg" />
                            </div>
                        ) : workflows.length > 0 ? (
                            <div className="flex flex-col gap-2">
                                <Table aria-label="Saved Workflows" isHeaderSticky>
                                    <TableHeader columns={columns}>
                                        {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
                                    </TableHeader>
                                    <TableBody items={workflows}>
                                        {(workflow) => (
                                            <TableRow
                                                key={workflow.id}
                                                className={`transition-colors duration-200 hover:bg-primary-50 dark:hover:bg-primary-800/10 ${
                                                    highlightedWorkflowId === workflow.id
                                                        ? 'bg-primary-50 dark:bg-primary-800/10'
                                                        : ''
                                                }`}
                                            >
                                                {(columnKey) => (
                                                    <TableCell>
                                                        {columnKey === 'action' ? (
                                                            <div className="flex items-center gap-2">
                                                                <Icon
                                                                    icon="solar:pen-bold"
                                                                    className="cursor-pointer text-default-400"
                                                                    height={18}
                                                                    width={18}
                                                                    onClick={() => handleEditClick(workflow)}
                                                                    aria-label="Edit"
                                                                />
                                                                <Icon
                                                                    icon="solar:copy-bold"
                                                                    className="cursor-pointer text-default-400"
                                                                    height={18}
                                                                    width={18}
                                                                    onClick={() => handleDuplicateClick(workflow)}
                                                                    aria-label="Duplicate"
                                                                />
                                                                <Icon
                                                                    icon="solar:trash-bin-trash-bold"
                                                                    className="cursor-pointer text-default-400"
                                                                    height={18}
                                                                    width={18}
                                                                    onClick={() => handleDeleteClick(workflow)}
                                                                    aria-label="Delete"
                                                                />
                                                            </div>
                                                        ) : columnKey === 'recentRuns' ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {workflowRuns[workflow.id]?.map((run) => (
                                                                    <Chip
                                                                        key={run.id}
                                                                        size="sm"
                                                                        variant="flat"
                                                                        className="cursor-pointer"
                                                                        onClick={() => handlePreviousRunClick(run.id)}
                                                                    >
                                                                        {run.id}
                                                                    </Chip>
                                                                ))}
                                                                {workflowRuns[workflow.id]?.length >= 5 && (
                                                                    <Chip
                                                                        size="sm"
                                                                        variant="flat"
                                                                        className="cursor-pointer"
                                                                        onClick={() =>
                                                                            window.open(
                                                                                `/runs/${workflow.id}`,
                                                                                '_blank'
                                                                            )
                                                                        }
                                                                        startContent={
                                                                            <Icon
                                                                                icon="solar:playlist-linear"
                                                                                width={14}
                                                                            />
                                                                        }
                                                                    >
                                                                        See All
                                                                    </Chip>
                                                                )}
                                                            </div>
                                                        ) : columnKey === 'name' ? (
                                                            <Chip
                                                                size="sm"
                                                                variant="flat"
                                                                className="cursor-pointer"
                                                                onClick={() => handleEditClick(workflow)}
                                                            >
                                                                {workflow.name}
                                                            </Chip>
                                                        ) : columnKey === 'spur_type' ? (
                                                            <SpurTypeChip spurType={workflow.definition.spur_type} />
                                                        ) : columnKey === 'updated_at' ? (
                                                            <span className="text-default-500">
                                                                {formatDate(getKeyValue(workflow, columnKey))}
                                                            </span>
                                                        ) : (
                                                            getKeyValue(workflow, columnKey)
                                                        )}
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                                {hasMoreWorkflows && (
                                    <div className="flex justify-center mt-4">
                                        <Button
                                            variant="flat"
                                            onPress={handleLoadMore}
                                            isLoading={isLoadingMore}
                                            startContent={!isLoadingMore && <Icon icon="lucide:plus" width={16} />}
                                        >
                                            {isLoadingMore ? 'Loading...' : 'Load More'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 my-8 bg-background rounded-xl border-border border shadow-sm">
                                <div className="max-w-2xl text-center mb-12">
                                    <h3 className="text-2xl font-semibold mb-4 text-foreground flex items-center justify-center gap-2">
                                        Welcome to PySpur!
                                    </h3>
                                    <p className="text-lg text-muted-foreground">
                                        Looks like you haven&apos;t created any spurs yet - let&apos;s get you started
                                        on your journey!
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                                    <div
                                        className="flex flex-col items-center p-6 bg-background hover:bg-accent/5 rounded-xl border-border border transition-all hover:shadow-md cursor-pointer"
                                        onClick={handleNewWorkflowClick}
                                    >
                                        <div className="rounded-full bg-background p-4 mb-4 border border-border">
                                            <Icon icon="lucide:plus" className="w-8 h-8 text-foreground" />
                                        </div>
                                        <h4 className="text-lg font-medium mb-3 text-foreground">Create New</h4>
                                        <p className="text-medium text-center text-muted-foreground">
                                            Start fresh with your own creation using the &quot;New Spur&quot; button
                                            above
                                        </p>
                                    </div>

                                    <div
                                        className="flex flex-col items-center p-6 bg-background hover:bg-accent/5 rounded-xl border-border border transition-all hover:shadow-md cursor-pointer"
                                        onClick={handleImportWorkflowClick}
                                    >
                                        <div className="rounded-full bg-background p-4 mb-4 border border-border">
                                            <Icon icon="lucide:upload" className="w-8 h-8 text-foreground" />
                                        </div>
                                        <h4 className="text-lg font-medium mb-3 text-foreground">Import Existing</h4>
                                        <p className="text-medium text-center text-muted-foreground">
                                            Have a spur saved as JSON? Use the &quot;Import Spur&quot; button to bring
                                            it in
                                        </p>
                                    </div>

                                    <div
                                        className="flex flex-col items-center p-6 bg-background hover:bg-accent/5 rounded-xl border-border border transition-all hover:shadow-md cursor-pointer"
                                        onClick={() => {
                                            const templateSection = document.querySelector(
                                                '[aria-label="Spur Templates"]'
                                            )
                                            templateSection?.scrollIntoView({ behavior: 'smooth' })
                                        }}
                                    >
                                        <div className="rounded-full bg-background p-4 mb-4 border border-border">
                                            <Icon icon="lucide:layout-grid" className="w-8 h-8 text-foreground" />
                                        </div>
                                        <h4 className="text-lg font-medium mb-3 text-foreground">Use Template</h4>
                                        <p className="text-medium text-center text-muted-foreground">
                                            Get started quickly with our ready-to-go templates in the section below
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </AccordionItem>
                    <AccordionItem
                        key="slack-agents"
                        aria-label="Slack Agents"
                        id="slack-section"
                        title={
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-semibold">Slack Agents</h3>
                                {slackAgents.length > 0 && (
                                    <Chip color="primary" variant="flat" size="sm">
                                        {slackAgents.length}
                                    </Chip>
                                )}
                            </div>
                        }
                    >
                        {isLoadingSlackAgents ? (
                            <div className="flex justify-center p-4">
                                <Spinner size="lg" />
                            </div>
                        ) : slackAgents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8">
                                <div className="max-w-md w-full">
                                    <div className="flex flex-col items-center mb-6">
                                        <div className="bg-default-100 rounded-full p-4 mb-4">
                                            <Icon icon="logos:slack-icon" width={32} height={32} />
                                        </div>
                                        <h4 className="text-lg font-medium mb-2 text-center">No Slack Agents Connected</h4>
                                        <p className="text-default-500 mb-4 text-center">
                                            Connect PySpur to your Slack workspace to create agents that can interact with your workflows.
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <Button
                                            color="primary"
                                            startContent={<Icon icon="logos:slack-icon" width={20} />}
                                            onPress={callHandleConnectToSlack}
                                            isDisabled={isLoadingSlackAgents}
                                            className="w-full"
                                        >
                                            Connect to Slack
                                        </Button>
                                        <Button
                                            variant="bordered"
                                            startContent={<Icon icon="lucide:help-circle" width={20} />}
                                            onPress={callHandleShowSlackSetup}
                                            className="w-full"
                                        >
                                            View Setup Guide
                                        </Button>
                                        <Button
                                            variant="flat"
                                            startContent={<Icon icon="lucide:settings" width={20} />}
                                            onPress={handleGoToSettings}
                                            className="w-full"
                                        >
                                            Configure API Keys
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-end mb-4">
                                    <Button
                                        className="bg-foreground text-background dark:bg-foreground/90 dark:text-background/90"
                                        startContent={<Icon icon="solar:add-circle-bold" width={16} className="flex-none text-background/60" />}
                                        onPress={() => router.push('/slack/create-agent')}
                                    >
                                        Create New Agent
                                    </Button>
                                </div>

                                <Table aria-label="Slack agents table" isHeaderSticky>
                                    <TableHeader>
                                        <TableColumn>NAME</TableColumn>
                                        <TableColumn>WORKSPACE</TableColumn>
                                        <TableColumn>TYPE</TableColumn>
                                        <TableColumn>WORKFLOW</TableColumn>
                                        <TableColumn>STATUS</TableColumn>
                                        <TableColumn>
                                            <div className="flex items-center gap-1">
                                                SOCKET MODE
                                                <Tooltip
                                                    content={
                                                        <div className="max-w-xs">
                                                            <p className="text-small font-medium mb-1">Socket Mode establishes a WebSocket connection between your Slack app and PySpur, allowing you to receive events in real-time without exposing a public URL.</p>
                                                            <p className="text-tiny">Once enabled, your agent will automatically process Slack events according to your trigger settings. Socket Mode requires both a bot token and an app-level token.</p>
                                                        </div>
                                                    }
                                                    placement="top"
                                                    showArrow={true}
                                                >
                                                    <Icon
                                                        icon="solar:socket-outline"
                                                        className="text-default-400 cursor-help"
                                                        width={16}
                                                    />
                                                </Tooltip>
                                            </div>
                                        </TableColumn>
                                        <TableColumn>ACTIONS</TableColumn>
                                    </TableHeader>
                                    <TableBody>
                                        {slackAgents.map((agent) => (
                                            <TableRow key={agent.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Icon icon="solar:bot-bold" width={20} />
                                                        <span>{agent.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{agent.slack_team_name}</TableCell>
                                                <TableCell>
                                                    {logAgentInfo(agent)}
                                                    {agent.spur_type ? (
                                                        <SpurTypeChip spurType={agent.spur_type} />
                                                    ) : (
                                                        <Chip
                                                            size="sm"
                                                            variant="flat"
                                                            startContent={<Icon icon="lucide:bot" width={16} />}
                                                        >
                                                            Agent
                                                        </Chip>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {agent.workflow_id ? (
                                                        <Chip
                                                            size="sm"
                                                            variant="flat"
                                                            color="primary"
                                                            className="cursor-pointer"
                                                            onClick={() => window.open(`/workflows/${agent.workflow_id}`, '_blank')}
                                                        >
                                                            {agent.workflow_id}
                                                        </Chip>
                                                    ) : (
                                                        <Chip
                                                            size="sm"
                                                            variant="flat"
                                                            color="warning"
                                                        >
                                                            Not Connected
                                                        </Chip>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        color={agent.is_active ? "success" : "danger"}
                                                        variant="flat"
                                                    >
                                                        {agent.is_active ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {agent.socket_mode_enabled ? (
                                                            <Badge color="success" variant="flat">
                                                                Active
                                                            </Badge>
                                                        ) : !agent.has_app_token ? (
                                                            <Badge color="warning" variant="flat">
                                                                Missing App Token
                                                            </Badge>
                                                        ) : (
                                                            <Badge color="default" variant="flat">
                                                                Inactive
                                                            </Badge>
                                                        )}
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="light"
                                                            color={agent.socket_mode_enabled ? "danger" : !agent.has_app_token ? "warning" : "success"}
                                                            onPress={async () => {
                                                                // Check if the agent has the required tokens
                                                                if (!agent.has_bot_token) {
                                                                    onAlert('Bot token required for Socket Mode. Configure it now by clicking on the key icon.', 'warning');
                                                                    return;
                                                                }

                                                                if (!agent.has_app_token && agent.socket_mode_enabled === false) {
                                                                    onAlert('App-level token (xapp-) required for Socket Mode. Configure it in the agent settings.', 'warning');
                                                                    return;
                                                                }

                                                                const result = await handleSocketModeToggle(agent, agent.socket_mode_enabled || false, setSlackAgents);
                                                                onAlert(result.message, result.success ? 'success' : 'danger');
                                                            }}
                                                            isDisabled={!agent.workflow_id || !agent.has_bot_token || (!agent.socket_mode_enabled && !agent.has_app_token)}
                                                            aria-label={agent.socket_mode_enabled ? "Stop Socket Mode" : "Start Socket Mode"}
                                                        >
                                                            <Tooltip content={
                                                                agent.socket_mode_enabled
                                                                ? "Stop Socket Mode"
                                                                : !agent.has_app_token
                                                                ? "App-level token required. Click the key icon to configure tokens."
                                                                : "Start Socket Mode"
                                                            }>
                                                                <Icon
                                                                    icon={
                                                                        agent.socket_mode_enabled
                                                                        ? "solar:stop-circle-bold"
                                                                        : !agent.has_app_token
                                                                        ? "solar:danger-triangle-bold"
                                                                        : "solar:play-circle-bold"
                                                                    }
                                                                    width={16}
                                                                />
                                                            </Tooltip>
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="light"
                                                            onPress={() => {
                                                                if (!agent.has_bot_token) {
                                                                    onAlert('Bot token required. Configure it now by clicking on the key icon.', 'warning');
                                                                    return;
                                                                }
                                                                console.log(`Testing connection for agent ${agent.id} (${agent.name})`);

                                                                // Store the agent for the modal
                                                                setTestConnectionAgent(agent);

                                                                // Show the test connection input modal instead of immediately testing
                                                                setShowTestConnectionInputModal(true);
                                                            }}
                                                            isDisabled={!agent.workflow_id}
                                                            aria-label="Test Connection"
                                                        >
                                                            <Tooltip content={agent.has_bot_token ? "Test Connection" : "Bot Token Required for Testing"}>
                                                                <Icon icon={agent.has_bot_token ? "solar:test-tube-bold" : "lucide:alert-triangle"} width={16} className={!agent.has_bot_token ? "text-warning" : ""} />
                                                            </Tooltip>
                                                        </Button>
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="light"
                                                            onPress={() => handleOpenAgentEditor(agent)}
                                                            aria-label="Edit Agent"
                                                        >
                                                            <Tooltip content="Edit Agent">
                                                                <Icon icon="solar:pen-bold" width={16} />
                                                            </Tooltip>
                                                        </Button>
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="light"
                                                            color="danger"
                                                            onPress={() => {
                                                                // Set agent to delete and show confirmation modal
                                                                setSelectedAgentForDetail(agent);
                                                                setShowDeleteConfirmModal(true);
                                                            }}
                                                            aria-label="Delete Agent"
                                                        >
                                                            <Tooltip content="Delete Agent">
                                                                <Icon icon="solar:trash-bin-trash-bold" width={16} />
                                                            </Tooltip>
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </AccordionItem>
                    <AccordionItem
                        key="human-tasks"
                        aria-label="Human Tasks"
                        title={
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-semibold">Spurs Awaiting Human Approval</h3>
                                {pausedWorkflows.length > 0 && (
                                    <Chip color="warning" variant="flat" size="sm">
                                        {pausedWorkflows.length}
                                    </Chip>
                                )}
                            </div>
                        }
                    >
                        {isLoadingPaused ? (
                            <div className="flex justify-center p-4">
                                <Spinner size="lg" />
                            </div>
                        ) : pausedWorkflows.length > 0 ? (
                            <div className="space-y-4">
                                {pausedWorkflows.map((workflow) => (
                                    <div
                                        key={workflow.run.id}
                                        className="flex items-center justify-between p-4 bg-content2 rounded-lg border border-border"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-medium">
                                                    {(workflow.workflow as WorkflowResponse).name}
                                                </h4>
                                                <Chip size="sm" color="warning">
                                                    Paused
                                                </Chip>
                                            </div>
                                            <p className="text-sm text-default-500 mb-2">
                                                {workflow.current_pause.pause_message}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-default-400">
                                                <span>Run ID: {workflow.run.id}</span>
                                                <span>•</span>
                                                <span>
                                                    Paused{' '}
                                                    {formatDistanceToNow(new Date(workflow.current_pause.pause_time), {
                                                        addSuffix: true,
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                color="success"
                                                variant="flat"
                                                onPress={() => handleQuickAction(workflow, 'APPROVE')}
                                                startContent={<Icon icon="lucide:check" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Approve"
                                            />
                                            <Button
                                                color="danger"
                                                variant="flat"
                                                onPress={() => handleQuickAction(workflow, 'DECLINE')}
                                                startContent={<Icon icon="lucide:x" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Decline"
                                            />
                                            <Button
                                                color="primary"
                                                variant="bordered"
                                                onPress={() => {
                                                    setSelectedWorkflow(workflow)
                                                    setIsHumanInputModalOpen(true)
                                                }}
                                                startContent={<Icon icon="lucide:more-horizontal" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Details"
                                            />
                                            <Button
                                                color="default"
                                                variant="light"
                                                onPress={() => handleCancelWorkflow(workflow)}
                                                startContent={<Icon icon="lucide:trash-2" width={16} />}
                                                isIconOnly
                                                size="sm"
                                                aria-label="Cancel Workflow"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center">
                                <p className="text-muted-foreground">No tasks currently requiring human approval.</p>
                            </div>
                        )}
                    </AccordionItem>
                    <AccordionItem
                        key="templates"
                        aria-label="Spur Templates"
                        title={<h3 className="text-xl font-semibold mb-4">Spur Templates</h3>}
                    >
                        {/* Spur Templates Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 px-1 mb-8">
                            {templates.map((template) => (
                                <TemplateCard
                                    key={template.file_name}
                                    title={template.name}
                                    description={template.description}
                                    features={template.features}
                                    onUse={() => handleUseTemplate(template)}
                                />
                            ))}
                        </div>
                    </AccordionItem>
                </Accordion>
            </div>
            {selectedWorkflow && (
                <HumanInputModal
                    isOpen={isHumanInputModalOpen}
                    onClose={() => {
                        setIsHumanInputModalOpen(false)
                        setSelectedWorkflow(null)
                    }}
                    workflow={selectedWorkflow}
                    onSubmit={handleHumanInputSubmit}
                />
            )}
            {/* New Spur Type Modal */}
            <Modal isOpen={isNewSpurModalOpen} onClose={onCloseNewSpurModal}>
                <ModalContent>
                    <ModalHeader className="flex flex-col gap-1">Create New Spur</ModalHeader>
                    <ModalBody>
                        <RadioGroup
                            label="Select the type of spur you want to create"
                            value={selectedSpurType}
                            onChange={(e) => setSelectedSpurType(e.target.value as SpurType)}
                        >
                            <Radio
                                value={SpurType.WORKFLOW}
                                description="Create a standard workflow with nodes and edges"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon icon="lucide:workflow" width={20} />
                                    <span>Workflow</span>
                                </div>
                            </Radio>
                            <Radio
                                value={SpurType.CHATBOT}
                                description="Create a chatbot with session management and conversational I/O"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon icon="lucide:message-square" width={20} />
                                    <span>Chatbot</span>
                                </div>
                            </Radio>
                        </RadioGroup>
                    </ModalBody>
                    <ModalFooter>
                        <Button color="danger" variant="light" onPress={onCloseNewSpurModal}>
                            Cancel
                        </Button>
                        <Button color="primary" onPress={handleCreateNewSpur}>
                            Create
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            {/* Slack Setup Guide Modal */}
            {showSlackSetupGuide && (
                <SlackSetupGuide
                    onClose={() => setShowSlackSetupGuide(false)}
                    onConnectClick={callHandleConnectToSlack}
                    setupInfo={slackSetupInfo}
                    onGoToSettings={handleGoToSettings}
                    onTokenConfigured={handleSlackTokenConfigured}
                />
            )}

            {/* Workflow Association Modal */}
            <WorkflowAssociationModal
                isOpen={showWorkflowAssociationModal}
                onClose={() => {
                    console.log('Closing workflow association modal')
                    setShowWorkflowAssociationModal(false)
                }}
                agent={selectedSlackAgent}
                onAssociate={handleAssociateWorkflow}
                onAlert={onAlert}
            />

            {/* Settings Modal */}
            <SettingsModal
                isOpen={isSettingsModalOpen}
                onOpenChange={setIsSettingsModalOpen}
                initialTab={settingsActiveTab}
            />


            {/* Delete Confirmation Modal */}
            <Modal isOpen={showDeleteConfirmModal} onOpenChange={setShowDeleteConfirmModal}>
                <ModalContent>
                    {() => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">Confirm Deletion</ModalHeader>
                            <ModalBody>
                                {selectedAgentForDetail && (
                                    <>
                                        <p>Are you sure you want to delete the agent <strong>{selectedAgentForDetail.name}</strong>?</p>
                                        <p className="text-small text-default-500 mt-2">
                                            This action cannot be undone. The agent and its token configuration will be permanently deleted.
                                        </p>
                                    </>
                                )}
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    color="default"
                                    variant="light"
                                    onPress={() => setShowDeleteConfirmModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="danger"
                                    onPress={() => {
                                        if (selectedAgentForDetail) {
                                            handleDeleteAgent(selectedAgentForDetail)
                                            setShowDeleteConfirmModal(false)
                                        }
                                    }}
                                >
                                    Delete Agent
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Slack Agent Wizard Modal */}
            {showSlackAgentWizard && (
                <div className="fixed inset-0 z-50 overflow-auto">
                    <SlackAgentWizard
                        workflows={workflows.filter(w => w.id !== undefined)}
                        onCreated={(newAgent) => handleAgentCreatedFromWizard(newAgent)}
                        onCancel={() => setShowSlackAgentWizard(false)}
                        isStandalone={false}
                    />
                </div>
            )}

            {/* Test Connection Modal */}
            <SlackTestConnection
                isOpen={showTestConnectionInputModal}
                onClose={() => setShowTestConnectionInputModal(false)}
                agent={testConnectionAgent}
                onAlert={onAlert}
            />

            {/* Add the Agent Editor Modal */}
            {selectedAgentForDetail && (
                <SlackAgentEditor
                    isOpen={showAgentEditorModal}
                    onOpenChange={setShowAgentEditorModal}
                    agent={selectedAgentForDetail}
                    updateAgentsCallback={setSlackAgents}
                    onAlert={onAlert}
                    onTokenUpdated={refreshAgentsAfterTokenUpdate}
                />
            )}
        </div>
    )
}

export default Dashboard
