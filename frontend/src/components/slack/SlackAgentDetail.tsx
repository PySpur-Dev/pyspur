import React, { useState, useEffect } from 'react'
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Card,
    CardBody,
    CardHeader,
    Tabs,
    Tab,
    Switch,
    Input,
    Chip,
    Spinner,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import {
    SlackAgent,
    toggleSlackTrigger,
    deleteSlackAgent,
    startSocketMode,
    stopSocketMode,
    getSocketModeStatus,
    SlackSocketModeResponse
} from '@/utils/api'
import AgentTokenManager from './SlackAgentEditor'
import SlackTestConnection from './SlackTestConnection'


interface SlackAgentDetailProps {
    isOpen: boolean
    onOpenChange: (isOpen: boolean) => void
    agent: SlackAgent | null
    updateAgentsCallback: (updater: (agents: SlackAgent[]) => SlackAgent[]) => void
    onAlert?: (message: string, color: 'success' | 'danger' | 'warning' | 'default') => void
    onTokenUpdated?: () => void
}

// Update the type for the socketModeStatus state to include error responses
type SocketModeResponse = SlackSocketModeResponse | {
    error: true;
    errorType: string;
    message: string;
    originalError?: any
};

// Add a type guard to check if a response is an error response
const isErrorResponse = (response: SocketModeResponse): response is {
    error: true;
    errorType: string;
    message: string;
    originalError?: any
} => {
    return 'error' in response && response.error === true;
};

const SlackAgentDetail: React.FC<SlackAgentDetailProps> = ({
    isOpen,
    onOpenChange,
    agent,
    updateAgentsCallback,
    onAlert,
    onTokenUpdated,
}) => {
    const [selectedTab, setSelectedTab] = useState('tokens')
    const [isLoading, setIsLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [keywords, setKeywords] = useState<string>(agent?.trigger_keywords?.join(', ') || '')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showTestConnectionModal, setShowTestConnectionModal] = useState(false)

    // Socket Mode state
    const [socketModeStatus, setSocketModeStatus] = useState<SocketModeResponse | null>(null)
    const [isSocketModeActive, setIsSocketModeActive] = useState(false)
    const [isSocketModeLoading, setIsSocketModeLoading] = useState(false)

    // New state variables
    const [showConfigErrorModal, setShowConfigErrorModal] = useState(false)
    const [configErrorMessage, setConfigErrorMessage] = useState('')
    const [configErrorTitle, setConfigErrorTitle] = useState('Configuration Error')

    // Fetch socket mode status when the component loads or when the tab changes to socket-mode
    useEffect(() => {
        if (agent && selectedTab === 'socket-mode') {
            checkSocketModeStatus();
        }
    }, [agent, selectedTab]);

    // Function to check the current socket mode status
    const checkSocketModeStatus = async () => {
        if (!agent) return;

        setIsSocketModeLoading(true);
        try {
            const status = await getSocketModeStatus(agent.id);

            // Check if response is an error object
            if (isErrorResponse(status)) {
                // Handle error silently (just log it) - we don't want to show errors for status checks
                console.error('Error checking socket mode status:', status);
                // Set to inactive if we can't determine status
                setIsSocketModeActive(false);
            } else {
                // Success response
                setSocketModeStatus(status);
                setIsSocketModeActive(status.socket_mode_active);
            }
        } catch (error) {
            // This should never happen with our new error handling, but just in case
            console.error('Unexpected error checking socket mode status:', error);
            setIsSocketModeActive(false);
        } finally {
            setIsSocketModeLoading(false);
        }
    };

    // Function to start socket mode
    const handleStartSocketMode = async () => {
        if (!agent) return;

        if (!agent.has_bot_token) {
            onAlert?.('Bot token required for Socket Mode. Configure it first.', 'warning');
            return;
        }

        setIsSocketModeLoading(true);
        try {
            const response = await startSocketMode(agent.id);

            // Check if response is an error object
            if (isErrorResponse(response)) {
                // Handle error response
                console.error('Socket Mode error:', response);

                let errorTitle = 'Socket Mode Error';
                const errorMessage = response.message;

                if (response.errorType === 'SocketModeTokenError') {
                    errorTitle = 'Socket Mode Token Required';
                } else if (response.errorType === 'SocketModeServerError') {
                    errorTitle = 'Server Error';
                }

                // Set state for the error modal
                setConfigErrorTitle(errorTitle);
                setConfigErrorMessage(errorMessage);
                setShowConfigErrorModal(true);

                // Also show a toast message
                onAlert?.(
                    errorTitle === 'Socket Mode Token Required'
                        ? 'Socket Mode requires an app-level token. See details for more information.'
                        : errorMessage,
                    errorTitle.includes('Token') ? 'warning' : 'danger'
                );
            } else {
                // Success response - it's a SlackSocketModeResponse
                setSocketModeStatus(response);
                setIsSocketModeActive(response.socket_mode_active);
                onAlert?.('Socket Mode started successfully', 'success');
            }
        } catch (error: any) {
            // This should never happen with our new error handling, but just in case
            console.error('Unexpected error starting socket mode:', error);

            setConfigErrorTitle('Unexpected Error');
            setConfigErrorMessage('An unexpected error occurred while trying to start Socket Mode.');
            setShowConfigErrorModal(true);

            onAlert?.('An unexpected error occurred', 'danger');
        } finally {
            setIsSocketModeLoading(false);
        }
    };

    // Function to stop socket mode
    const handleStopSocketMode = async () => {
        if (!agent) return;

        setIsSocketModeLoading(true);
        try {
            const response = await stopSocketMode(agent.id);

            // Check if response is an error object
            if (isErrorResponse(response)) {
                // Handle error response
                console.error('Socket Mode stop error:', response);
                onAlert?.(response.message, 'danger');
            } else {
                // Success response
                setSocketModeStatus(response);
                setIsSocketModeActive(response.socket_mode_active);
                onAlert?.('Socket Mode stopped successfully', 'success');
            }
        } catch (error: any) {
            // This should never happen with our new error handling, but just in case
            console.error('Unexpected error stopping socket mode:', error);
            onAlert?.('An unexpected error occurred while stopping Socket Mode', 'danger');
        } finally {
            setIsSocketModeLoading(false);
        }
    };

    const handleTokenUpdated = () => {
        console.log('SlackAgentDetail - handleTokenUpdated called')
        // Refresh the agents list after token update
        // This would typically be implemented via the parent component's callback
        if (onTokenUpdated) {
            console.log('Calling parent onTokenUpdated callback')
            onTokenUpdated()
        } else {
            console.log('No onTokenUpdated callback provided')
            // Also update the UI with a success message if onTokenUpdated doesn't handle it
            if (onAlert) {
                onAlert('Token configuration updated', 'success')
            }
        }
    }

    const handleSwitchChange = async (field: string, value: boolean) => {
        if (!agent) return

        try {
            await toggleSlackTrigger(agent.id, field, value, [agent], updateAgentsCallback, onAlert)
        } catch (error) {
            console.error('Error toggling trigger:', error)
            onAlert?.('Failed to update trigger settings', 'danger')
        }
    }

    const handleTestConnection = () => {
        if (!agent) return
        if (!agent.has_bot_token) {
            onAlert?.('Bot token required. Configure it first.', 'warning')
            return
        }

        // Show the test connection modal
        setShowTestConnectionModal(true)
    }

    const updateKeywords = async () => {
        if (!agent) return
        setIsLoading(true)
        try {
            // Split, trim, and filter out empty strings
            const keywordArray = keywords
                .split(',')
                .map((k) => k.trim())
                .filter((k) => k)

            const response = await fetch(`/api/slack/agents/${agent.id}/trigger-config`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    trigger_on_mention: agent.trigger_on_mention,
                    trigger_on_direct_message: agent.trigger_on_direct_message,
                    trigger_on_channel_message: agent.trigger_on_channel_message,
                    trigger_keywords: keywordArray,
                    trigger_enabled: agent.trigger_enabled,
                }),
            })

            if (response.ok) {
                const updatedAgent = await response.json()
                updateAgentsCallback((agents) =>
                    agents.map((a) => (a.id === agent.id ? updatedAgent : a))
                )
                onAlert?.('Keywords updated successfully', 'success')
            } else {
                onAlert?.('Failed to update keywords', 'danger')
            }
        } catch (error) {
            console.error('Error updating keywords:', error)
            onAlert?.('Failed to update keywords', 'danger')
        } finally {
            setIsLoading(false)
        }
    }

    const handleDeleteAgent = async () => {
        if (!agent) return
        setIsDeleting(true)
        try {
            const success = await deleteSlackAgent(agent.id, onAlert)
            if (success) {
                // Close the modal
                onOpenChange(false)
                // Update the agents list by removing this agent
                updateAgentsCallback((agents) => agents.filter((a) => a.id !== agent.id))
            }
        } catch (error) {
            console.error('Error deleting agent:', error)
            onAlert?.('Failed to delete agent', 'danger')
        } finally {
            setIsDeleting(false)
            setShowDeleteConfirm(false)
        }
    }

    // Add a function to open the settings modal
    const handleGoToSettings = () => {
        // Close the current modal
        setShowConfigErrorModal(false);
        // You might need logic here to navigate to settings or open a settings modal
        // This depends on your application's structure
        window.open('/settings/keys', '_blank');
    };

    if (!agent) {
        return null
    }

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="flex items-center gap-2">
                            <Icon icon="logos:slack-icon" width={24} />
                            <div>
                                <h2>{agent.name}</h2>
                                <p className="text-small text-default-500">{agent.slack_team_name}</p>
                            </div>
                        </ModalHeader>
                        <ModalBody>
                            <Tabs
                                selectedKey={selectedTab}
                                onSelectionChange={(key) => setSelectedTab(key.toString())}
                                variant="underlined"
                                classNames={{
                                    base: "w-full",
                                    tabList: "gap-6 w-full relative",
                                }}
                            >
                                <Tab
                                    key="tokens"
                                    title={
                                        <div className="flex items-center gap-2">
                                            <Icon icon="solar:key-minimalistic-bold" className="text-xl" />
                                            <span>Authentication</span>
                                        </div>
                                    }
                                >
                                    <div className="py-4">
                                        <AgentTokenManager
                                            agent={agent}
                                            onTokenUpdated={handleTokenUpdated}
                                            onAlert={onAlert}
                                        />
                                    </div>
                                </Tab>
                                <Tab
                                    key="triggers"
                                    title={
                                        <div className="flex items-center gap-2">
                                            <Icon icon="solar:bolt-bold" className="text-xl" />
                                            <span>Triggers</span>
                                        </div>
                                    }
                                >
                                    <div className="py-4 space-y-4">
                                        <Card className="border border-default-200">
                                            <CardHeader>
                                                <h3 className="text-medium font-medium">Trigger Settings</h3>
                                            </CardHeader>
                                            <CardBody className="flex flex-col gap-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-medium">Enable Triggers</h4>
                                                        <p className="text-small text-default-500">
                                                            Master switch for all triggers
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        isSelected={agent.trigger_enabled}
                                                        onValueChange={(value) =>
                                                            handleSwitchChange('trigger_enabled', value)
                                                        }
                                                    />
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-medium">Respond to Mentions</h4>
                                                        <p className="text-small text-default-500">
                                                            Trigger when agent is @mentioned
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        isDisabled={!agent.trigger_enabled}
                                                        isSelected={agent.trigger_on_mention}
                                                        onValueChange={(value) =>
                                                            handleSwitchChange('trigger_on_mention', value)
                                                        }
                                                    />
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-medium">Respond to Direct Messages</h4>
                                                        <p className="text-small text-default-500">
                                                            Trigger on any direct message to the bot
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        isDisabled={!agent.trigger_enabled}
                                                        isSelected={agent.trigger_on_direct_message}
                                                        onValueChange={(value) =>
                                                            handleSwitchChange('trigger_on_direct_message', value)
                                                        }
                                                    />
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-medium">Respond in Channels</h4>
                                                        <p className="text-small text-default-500">
                                                            Trigger on channel messages with keywords
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        isDisabled={!agent.trigger_enabled}
                                                        isSelected={agent.trigger_on_channel_message}
                                                        onValueChange={(value) =>
                                                            handleSwitchChange('trigger_on_channel_message', value)
                                                        }
                                                    />
                                                </div>

                                                {agent.trigger_on_channel_message && (
                                                    <div className="flex flex-col gap-2">
                                                        <h4 className="text-medium">Trigger Keywords</h4>
                                                        <p className="text-small text-default-500">
                                                            Comma-separated list of keywords to trigger the agent
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <Input
                                                                placeholder="help, question, info"
                                                                value={keywords}
                                                                onChange={(e) => setKeywords(e.target.value)}
                                                                variant="bordered"
                                                            />
                                                            <Button
                                                                color="primary"
                                                                isLoading={isLoading}
                                                                onPress={updateKeywords}
                                                            >
                                                                Save
                                                            </Button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {agent.trigger_keywords?.map((keyword, index) => (
                                                                <Chip key={index} size="sm">
                                                                    {keyword}
                                                                </Chip>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </CardBody>
                                        </Card>
                                    </div>
                                </Tab>
                                <Tab
                                    key="socket-mode"
                                    title={
                                        <div className="flex items-center gap-2">
                                            <Icon icon="solar:socket-outline" className="text-xl" />
                                            <span>Socket Mode</span>
                                        </div>
                                    }
                                >
                                    <div className="py-4 space-y-4">
                                        <Card className="border border-default-200">
                                            <CardHeader>
                                                <h3 className="text-medium font-medium">Socket Mode</h3>
                                            </CardHeader>
                                            <CardBody className="flex flex-col gap-4">
                                                <p className="text-small">
                                                    Socket Mode establishes a WebSocket connection with Slack, enabling real-time
                                                    event processing without requiring a public URL for events. This is ideal for
                                                    local development and environments without public endpoints.
                                                </p>

                                                <div className="flex items-center gap-3 my-2">
                                                    <div className="flex-1">
                                                        <h4 className="font-medium">Status:</h4>
                                                        {isSocketModeLoading ? (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Spinner size="sm" />
                                                                <span className="text-small">Checking status...</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className={`w-2 h-2 rounded-full ${isSocketModeActive ? 'bg-success' : 'bg-danger'}`}></span>
                                                                <span className="text-small">{isSocketModeActive ? 'Active' : 'Inactive'}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <Button
                                                            color="primary"
                                                            isDisabled={isSocketModeActive || isSocketModeLoading || !agent.has_bot_token}
                                                            isLoading={isSocketModeLoading && !isSocketModeActive}
                                                            onPress={handleStartSocketMode}
                                                            startContent={<Icon icon="solar:play-bold" />}
                                                        >
                                                            Start
                                                        </Button>
                                                        <Button
                                                            color="danger"
                                                            isDisabled={!isSocketModeActive || isSocketModeLoading}
                                                            isLoading={isSocketModeLoading && isSocketModeActive}
                                                            onPress={handleStopSocketMode}
                                                            startContent={<Icon icon="solar:stop-bold" />}
                                                        >
                                                            Stop
                                                        </Button>
                                                    </div>
                                                </div>

                                                {!agent.has_bot_token && (
                                                    <div className="p-3 bg-warning-50 text-warning-800 rounded-md mt-2">
                                                        <div className="flex items-start gap-2">
                                                            <Icon icon="solar:danger-triangle-bold" className="text-lg mt-0.5" />
                                                            <div>
                                                                <p className="font-medium">Bot Token Required</p>
                                                                <p className="text-small">
                                                                    You need to configure a bot token in the Authentication tab before using Socket Mode.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="mt-4">
                                                    <h4 className="font-medium mb-2">Requirements for Socket Mode:</h4>
                                                    <ul className="list-disc list-inside text-small space-y-1 pl-2">
                                                        <li>A bot token with the required scopes (connections:write)</li>
                                                        <li>SLACK_SIGNING_SECRET environment variable configured</li>
                                                        <li>Socket Mode enabled in your Slack app settings</li>
                                                    </ul>
                                                </div>
                                            </CardBody>
                                        </Card>
                                    </div>
                                </Tab>
                            </Tabs>
                        </ModalBody>
                        <ModalFooter>
                            <Button
                                color="primary"
                                variant="light"
                                startContent={<Icon icon="solar:test-tube-bold" width={20} />}
                                onPress={handleTestConnection}
                            >
                                Test Connection
                            </Button>
                            <Button
                                color="danger"
                                variant="light"
                                onPress={() => setShowDeleteConfirm(true)}
                                endContent={<Icon icon="solar:trash-bin-trash-bold" />}
                            >
                                Delete Agent
                            </Button>
                            <Button color="primary" onPress={() => onOpenChange(false)}>
                                Close
                            </Button>
                        </ModalFooter>

                        {/* Delete confirmation modal */}
                        <Modal isOpen={showDeleteConfirm} onOpenChange={setShowDeleteConfirm} size="sm">
                            <ModalContent>
                                {() => (
                                    <>
                                        <ModalHeader>Confirm Delete</ModalHeader>
                                        <ModalBody>
                                            <p>Are you sure you want to delete the agent <strong>{agent.name}</strong>?</p>
                                            <p className="text-small text-default-500 mt-2">
                                                This action cannot be undone. The agent and its token configuration will be permanently deleted.
                                            </p>
                                        </ModalBody>
                                        <ModalFooter>
                                            <Button
                                                color="default"
                                                variant="light"
                                                onPress={() => setShowDeleteConfirm(false)}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                color="danger"
                                                onPress={handleDeleteAgent}
                                                isLoading={isDeleting}
                                            >
                                                Delete Agent
                                            </Button>
                                        </ModalFooter>
                                    </>
                                )}
                            </ModalContent>
                        </Modal>

                        {/* Test Connection Modal */}
                        <SlackTestConnection
                            isOpen={showTestConnectionModal}
                            onClose={() => setShowTestConnectionModal(false)}
                            agent={agent}
                            onAlert={onAlert}
                        />

                    </>
                )}
            </ModalContent>
        </Modal>
    )
}

export default SlackAgentDetail