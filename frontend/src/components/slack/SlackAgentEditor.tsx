import React, { useState, useEffect } from 'react'
import {
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    Input,
    Button,
    Chip,
    Tooltip,
    Tabs,
    Tab,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Switch,
    Spinner,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import {
    SlackAgent,
    fetchMaskedToken,
    saveSlackTokens,
    deleteSlackToken,
    toggleSlackTrigger,
    testSlackConnection,
    getSocketModeStatus,
    startSocketMode,
    stopSocketMode,
    updateTriggerConfig,
    SlackSocketModeResponse
} from '@/utils/api'
import SlackTestConnection from './SlackTestConnection'

interface AgentTokenManagerProps {
    agent: SlackAgent
    isOpen?: boolean
    onOpenChange?: (isOpen: boolean) => void
    onTokenUpdated?: () => void
    onAlert?: (message: string, color: 'success' | 'danger' | 'warning' | 'default') => void
    updateAgentsCallback?: (updater: (agents: SlackAgent[]) => SlackAgent[]) => void
    standalone?: boolean
}

interface TokenStatus {
    type: string
    label: string
    masked: string
    lastUpdated: string | null
    exists: boolean
}

// Add a type for the socketModeStatus state to include error responses
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

// Add a component to show installation unavailable error
const SlackInstallationUnavailableAlert: React.FC<{
    isVisible: boolean;
    onReinstall: () => void;
}> = ({ isVisible, onReinstall }) => {
    if (!isVisible) return null;

    return (
        <div className="p-3 my-3 bg-warning-50 border border-warning-200 rounded-md">
            <div className="flex items-start gap-2">
                <Icon icon="solar:danger-triangle-bold" className="text-lg mt-0.5 text-warning-600" />
                <div>
                    <p className="font-medium text-warning-700">Slack Connection Lost</p>
                    <p className="text-small text-warning-600">
                        Your Slack installation is no longer available. This can happen if the app was removed from your workspace or the installation data was lost.
                    </p>
                    <Button
                        color="warning"
                        size="sm"
                        className="mt-2"
                        startContent={<Icon icon="solar:refresh-bold" />}
                        onPress={onReinstall}
                    >
                        Reinstall App
                    </Button>
                </div>
            </div>
        </div>
    );
};

const AgentTokenManager: React.FC<AgentTokenManagerProps> = ({
    agent,
    isOpen,
    onOpenChange,
    onTokenUpdated,
    onAlert,
    updateAgentsCallback,
    standalone = false
}) => {
    const [selectedTab, setSelectedTab] = useState('tokens')
    const [botToken, setBotToken] = useState<string>('')
    const [userToken, setUserToken] = useState<string>('')
    const [appToken, setAppToken] = useState<string>('')
    const [keywords, setKeywords] = useState<string>('')
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false)
    const [tokenStatus, setTokenStatus] = useState<{
        bot_token: TokenStatus;
        user_token: TokenStatus;
        app_token: TokenStatus;
    }>({
        bot_token: {
            type: 'bot_token',
            label: 'Bot Token',
            masked: '',
            lastUpdated: null,
            exists: false
        },
        user_token: {
            type: 'user_token',
            label: 'User Token',
            masked: '',
            lastUpdated: null,
            exists: false
        },
        app_token: {
            type: 'app_token',
            label: 'App Token',
            masked: '',
            lastUpdated: null,
            exists: false
        }
    })
    const [message, setMessage] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Socket Mode state
    const [socketModeStatus, setSocketModeStatus] = useState<SocketModeResponse | null>(null)
    const [isSocketModeActive, setIsSocketModeActive] = useState(false)
    const [isSocketModeLoading, setIsSocketModeLoading] = useState(false)

    // Installation status state
    const [isInstallationUnavailable, setIsInstallationUnavailable] = useState(false)

    // Trigger settings state
    const [showTestConnectionModal, setShowTestConnectionModal] = useState(false)

    // Initialize token status on mount or when agent changes
    useEffect(() => {
        if (agent) {
            const hasBotToken = agent.has_bot_token || false
            const hasUserToken = agent.has_user_token || false
            const hasAppToken = agent.has_app_token || false

            // Set keywords from agent
            setKeywords(agent?.trigger_keywords?.join(', ') || '')

            // Set initial token status
            setTokenStatus({
                bot_token: {
                    type: 'bot_token',
                    label: 'Bot Token',
                    masked: '',
                    lastUpdated: agent.last_token_update || null,
                    exists: hasBotToken
                },
                user_token: {
                    type: 'user_token',
                    label: 'User Token',
                    masked: '',
                    lastUpdated: agent.last_token_update || null,
                    exists: hasUserToken
                },
                app_token: {
                    type: 'app_token',
                    label: 'App Token',
                    masked: '',
                    lastUpdated: agent.last_token_update || null,
                    exists: hasAppToken
                }
            })

            // Fetch masked tokens
            fetchTokens()
        }
    }, [agent])

    // Function to fetch all masked tokens for the agent
    const fetchTokens = async () => {
        if (!agent) return;

        try {
            const promises = []

            if (agent.has_bot_token) {
                promises.push(fetchMaskedTokenAndUpdate('bot_token'))
            }
            if (agent.has_user_token) {
                promises.push(fetchMaskedTokenAndUpdate('user_token'))
            }
            if (agent.has_app_token) {
                promises.push(fetchMaskedTokenAndUpdate('app_token'))
            }

            if (promises.length > 0) {
                await Promise.all(promises)
            }
        } catch (error) {
            console.error('Error fetching masked tokens:', error)
            onAlert?.('Failed to load token information', 'warning')
        }
    }

    // Fetch socket mode status when the socket-mode tab is selected
    useEffect(() => {
        if (agent && selectedTab === 'socket-mode') {
            checkSocketModeStatus();
        }
    }, [agent, selectedTab]);

    const fetchMaskedTokenAndUpdate = async (tokenType: string) => {
        try {
            const data = await fetchMaskedToken(agent.id, tokenType)

            if (tokenType === 'bot_token') {
                setTokenStatus(prev => ({
                    ...prev,
                    bot_token: {
                        ...prev.bot_token,
                        masked: data.masked_token,
                        lastUpdated: data.updated_at
                    }
                }))
            } else if (tokenType === 'app_token') {
                setTokenStatus(prev => ({
                    ...prev,
                    app_token: {
                        ...prev.app_token,
                        masked: data.masked_token,
                        lastUpdated: data.updated_at
                    }
                }))
            } else {
                setTokenStatus(prev => ({
                    ...prev,
                    user_token: {
                        ...prev.user_token,
                        masked: data.masked_token,
                        lastUpdated: data.updated_at
                    }
                }))
            }
        } catch (error) {
            console.error(`Error fetching ${tokenType}:`, error)
            onAlert?.(`Failed to fetch ${tokenType}`, 'danger')
        }
    }

    const saveTokens = async () => {
        try {
            await saveSlackTokens(agent.id, {
                bot_token: botToken,
                user_token: userToken,
                app_token: appToken
            });
            setMessage('Tokens saved successfully');
            onTokenUpdated?.();
        } catch (error) {
            console.error('Error saving tokens:', error);
            setMessage('Failed to save tokens');
        }
    }

    const handleDeleteToken = async (tokenType: string) => {
        setIsLoading(true)
        try {
            await deleteSlackToken(agent.id, tokenType)

            // Update token status
            setTokenStatus(prev => ({
                ...prev,
                [tokenType]: {
                    ...prev[tokenType as keyof typeof prev],
                    exists: false,
                    masked: '',
                    lastUpdated: null
                }
            }))

            onAlert?.(`${tokenType === 'bot_token' ? 'Bot' : tokenType === 'app_token' ? 'App' : 'User'} token deleted successfully`, 'success')
            onTokenUpdated?.()
        } catch (error) {
            console.error(`Error deleting ${tokenType}:`, error)
            onAlert?.(`Failed to delete ${tokenType}`, 'danger')
        } finally {
            setIsLoading(false)
        }
    }

    const formatDate = (dateString: string | null) => {
        if (!dateString) return ''
        const date = new Date(dateString)
        return date.toLocaleString()
    }

    const getTokenPrefix = (tokenType: string) => {
        if (tokenType === 'bot_token') return 'xoxb-'
        if (tokenType === 'user_token') return 'xoxp-'
        if (tokenType === 'app_token') return 'xapp-'
        return ''
    }

    const renderTokenSection = (
        tokenType: string,
        status: TokenStatus,
        tokenValue: string,
        setTokenValue: (value: string) => void
    ) => {
        // Get token description based on type
        const getTokenDescription = (type: string) => {
            if (type === 'bot_token') {
                return "Bot tokens (xoxb-) are required for core functionality like sending messages to Slack channels. This is the primary token needed for most operations."
            } else if (type === 'user_token') {
                return "User tokens (xoxp-) allow actions to be performed as a specific user, such as accessing user-specific data or performing user-level actions."
            } else if (type === 'app_token') {
                return "App tokens (xapp-) are only used for Socket Mode connections to receive events in real-time without exposing a public endpoint. Cannot be used to send messages."
            }
            return ""
        }

        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-medium font-medium">{status.label}</h3>
                    {status.exists ? (
                        <Chip color="success" size="sm">
                            Configured
                        </Chip>
                    ) : (
                        <Chip color="warning" size="sm">
                            Not Configured
                        </Chip>
                    )}
                </div>

                <div className="text-small text-default-500 mb-2">
                    {getTokenDescription(tokenType)}
                </div>

                {status.exists ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 font-mono text-small bg-default-100 rounded-lg p-3 border border-default-200">
                                <div className="flex items-center gap-2">
                                    <Icon icon="solar:key-minimalistic-bold" className="text-default-500" width={16} />
                                    <span className="text-default-500 truncate overflow-hidden max-w-[250px]">{status.masked}</span>
                                </div>
                                <div className="text-tiny text-default-400 mt-1">
                                    Last updated: {formatDate(status.lastUpdated)}
                                </div>
                            </div>
                            <Tooltip content="Delete token">
                                <Button
                                    isIconOnly
                                    color="danger"
                                    variant="light"
                                    size="sm"
                                    onPress={() => handleDeleteToken(tokenType)}
                                    isLoading={isLoading}
                                >
                                    <Icon icon="solar:trash-bin-trash-bold" width={20} />
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <Input
                                    type="password"
                                    label={`Enter ${status.label}`}
                                    placeholder={`Paste ${status.label.toLowerCase()} here`}
                                    value={tokenValue}
                                    onChange={(e) => setTokenValue(e.target.value)}
                                    variant="bordered"
                                    size="sm"
                                    startContent={
                                        <div className="pointer-events-none flex items-center">
                                            <Icon icon="solar:key-minimalistic-bold" className="text-default-400" width={16} />
                                        </div>
                                    }
                                    description={
                                        <div className="flex items-center gap-1 mt-1 text-tiny text-default-400">
                                            <Icon icon="solar:info-circle-bold" width={14} />
                                            {status.label} should start with <code className="mx-1">{getTokenPrefix(tokenType)}</code>
                                        </div>
                                    }
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Handle switch changes for trigger settings
    const handleSwitchChange = async (field: string, value: boolean) => {
        if (!agent) return

        try {
            await toggleSlackTrigger(
                agent.id,
                field,
                value,
                updateAgentsCallback ? [agent] : [],
                updateAgentsCallback,
                onAlert
            )
        } catch (error) {
            console.error('Error toggling trigger:', error)
            onAlert?.('Failed to update trigger settings', 'danger')
        }
    }

    // Update keywords
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
                if (updateAgentsCallback) {
                    updateAgentsCallback((agents) =>
                        agents.map((a) => (a.id === agent.id ? updatedAgent : a))
                    )
                }
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

                // Show a toast message
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

    // Function to test connection
    const handleTestConnection = async () => {
        if (!agent) return;

        if (!agent.has_bot_token) {
            onAlert?.('Bot token required. Configure it first.', 'warning');
            return;
        }

        setIsTestingConnection(true);
        try {
            const result = await testSlackConnection(agent.id);
            handleTestConnectionComplete(result);
        } catch (error) {
            console.error("Error testing connection:", error);
            handleTestConnectionComplete({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error testing Slack connection',
                error
            });
        } finally {
            setIsTestingConnection(false);
        }
    };

    // Handle reinstall when installation is unavailable
    const handleReinstall = () => {
        if (onAlert) {
            onAlert('Redirecting to Slack for reinstallation...', 'default')
        }

        // Use the connectToSlack function from the API utils
        import('@/utils/api').then(({ connectToSlack }) => {
            connectToSlack(onAlert)
        }).catch(error => {
            console.error('Error importing connectToSlack:', error)
            onAlert?.('Failed to start Slack reinstallation process', 'danger')
        })
    }

    // Callback for when the test connection reports an installation error
    const handleTestConnectionComplete = (result: { success: boolean, message: string, error?: any }) => {
        // Check for installation unavailable error
        if (!result.success && result.message && (
            result.message.includes('installation') ||
            result.message.includes('reinstall') ||
            (result.error?.response?.data?.detail && result.error.response.data.detail.includes('installation'))
        )) {
            setIsInstallationUnavailable(true)
        }
    }

    const renderContent = () => (
        <div className="space-y-4">
            {/* Display installation unavailable alert if needed */}
            <SlackInstallationUnavailableAlert
                isVisible={isInstallationUnavailable}
                onReinstall={handleReinstall}
            />

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
                    <div className="py-4 space-y-6">
                        <div className="p-3 bg-default-50 border border-default-200 rounded-md mb-4">
                            <h4 className="font-medium text-medium mb-2">Slack Token Overview</h4>
                            <p className="text-small mb-2">
                                Different token types serve different purposes in the Slack API:
                            </p>
                            <ul className="list-disc list-inside text-small space-y-1 pl-2">
                                <li><span className="font-semibold">Bot Tokens (xoxb-)</span>: Required for sending messages and most API operations</li>
                                <li><span className="font-semibold">User Tokens (xoxp-)</span>: For user-level actions (optional)</li>
                                <li><span className="font-semibold">App Tokens (xapp-)</span>: Only for Socket Mode connections, cannot send messages</li>
                            </ul>
                            <div className="mt-2 flex items-center gap-2 text-small text-warning-700">
                                <Icon icon="solar:info-circle-bold" width={16} />
                                <span>App tokens cannot be used as a substitute for bot tokens when sending messages.</span>
                            </div>
                        </div>

                        {renderTokenSection('bot_token', tokenStatus.bot_token, botToken, setBotToken)}
                        {renderTokenSection('user_token', tokenStatus.user_token, userToken, setUserToken)}
                        {renderTokenSection('app_token', tokenStatus.app_token, appToken, setAppToken)}

                        {/* Save button - only show if there are tokens to save */}
                        {(botToken || userToken || appToken) && (
                            <div className="flex justify-end pt-4 border-t border-default-200">
                                <Button
                                    color="primary"
                                    size="sm"
                                    onPress={() => saveTokens()}
                                    isLoading={isLoading}
                                    startContent={<Icon icon="solar:disk-bold" width={18} />}
                                >
                                    Save Tokens
                                </Button>
                            </div>
                        )}
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
                        <div className="flex flex-col gap-4">
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
                        </div>
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
                        <div className="flex flex-col gap-4">
                            <p className="text-small">
                                Socket Mode establishes a WebSocket connection with Slack, enabling real-time
                                event processing without requiring a public URL for events. This is ideal for
                                local development and environments without public endpoints.
                            </p>

                            <div className="p-3 bg-default-50 rounded-md border border-default-200">
                                <h4 className="font-medium text-medium mb-2">Token Requirements</h4>
                                <ul className="list-disc list-inside text-small space-y-2 pl-2">
                                    <li className="flex items-start">
                                        <span className="font-semibold inline-block min-w-[100px]">Bot Token:</span>
                                        <span className="flex-1">Required for authenticating API requests <span className={agent.has_bot_token ? "text-success" : "text-danger"}>({agent.has_bot_token ? "Configured ✓" : "Not Configured ✗"})</span></span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="font-semibold inline-block min-w-[100px]">App Token:</span>
                                        <span className="flex-1">Required specifically for Socket Mode connections <span className={agent.has_app_token ? "text-success" : "text-danger"}>({agent.has_app_token ? "Configured ✓" : "Not Configured ✗"})</span></span>
                                    </li>
                                </ul>
                            </div>

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

                            {agent.has_bot_token && !agent.has_app_token && (
                                <div className="p-3 bg-warning-50 text-warning-800 rounded-md mt-2">
                                    <div className="flex items-start gap-2">
                                        <Icon icon="solar:danger-triangle-bold" className="text-lg mt-0.5" />
                                        <div>
                                            <p className="font-medium">App Token Required</p>
                                            <p className="text-small">
                                                Socket Mode requires an app-level token (xapp-) in addition to your bot token.
                                                Configure an app token in the Authentication tab or in your environment variables.
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
                                    <li>An app-level token (xapp-) with connections:write scope</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </Tab>
            </Tabs>

            {message && (
                <div className="text-tiny mt-2">
                    <div className="flex items-center gap-2">
                        <Icon
                            icon={message.includes('success') ? "solar:check-circle-bold" : "solar:close-circle-bold"}
                            className={message.includes('success') ? "text-success" : "text-danger"}
                            width={16}
                        />
                        <p>{message}</p>
                    </div>
                </div>
            )}

            {!standalone && (
                <div className="flex justify-end mt-4 pt-4 border-t border-default-200">
                    <Tooltip
                        content="Bot token is required to test connection"
                        isDisabled={agent.has_bot_token}
                    >
                        <Button
                            color="primary"
                            variant="light"
                            startContent={<Icon icon="solar:test-tube-bold" width={20} />}
                            onPress={handleTestConnection}
                            isDisabled={!agent.has_bot_token}
                        >
                            Test Connection
                        </Button>
                    </Tooltip>
                </div>
            )}
        </div>
    )

    // If not a standalone component, return modal version
    if (!standalone && isOpen !== undefined && onOpenChange !== undefined) {
        return (
            <>
                <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
                    <ModalContent>
                        {() => (
                            <>
                                <ModalHeader className="flex items-center gap-2">
                                    <Icon icon="logos:slack-icon" width={24} />
                                    <div>
                                        <h2>Edit {agent.name}</h2>
                                        <p className="text-small text-default-500">{agent.slack_team_name}</p>
                                    </div>
                                </ModalHeader>
                                <ModalBody>
                                    {renderContent()}
                                </ModalBody>
                                <ModalFooter>
                                    <Button color="primary" onPress={() => onOpenChange(false)}>
                                        Close
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
                    onComplete={handleTestConnectionComplete}
                />
            </>
        )
    }

    // Original card version
    return (
        <>
            <Card className="border border-default-200">
                <CardHeader className="flex items-center justify-between gap-2 pb-0">
                    <div>
                        <h3 className="text-medium font-medium">Slack Tokens</h3>
                        <p className="text-tiny text-default-500">
                            Configure authentication tokens for this Slack agent
                        </p>
                    </div>
                    <Icon icon="logos:slack-icon" width={24} />
                </CardHeader>
                <CardBody className="space-y-6">
                    {renderContent()}
                </CardBody>
                {message && (
                    <CardFooter className="text-tiny text-default-500">
                        <div className="flex items-center gap-2">
                            <Icon
                                icon={message.includes('success') ? "solar:check-circle-bold" : "solar:close-circle-bold"}
                                className={message.includes('success') ? "text-success" : "text-danger"}
                                width={16}
                            />
                            <p>{message}</p>
                        </div>
                    </CardFooter>
                )}
            </Card>

            {/* Test Connection Modal */}
            <SlackTestConnection
                isOpen={showTestConnectionModal}
                onClose={() => setShowTestConnectionModal(false)}
                agent={agent}
                onAlert={onAlert}
                onComplete={handleTestConnectionComplete}
            />
        </>
    )
}

export default AgentTokenManager