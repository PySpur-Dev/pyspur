import React, { useState, useEffect } from 'react'
import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Spinner
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { AlertFunction, SlackAgent, sendTestMessage } from '@/utils/api'

// Props for the main test connection component
interface SlackTestConnectionProps {
    isOpen: boolean
    onClose: () => void
    agent: SlackAgent | null
    onAlert?: AlertFunction
    onComplete?: (result: { success: boolean, message: string, error?: any }) => void
}

// Component that manages both test input and result states
const SlackTestConnection: React.FC<SlackTestConnectionProps> = ({
    isOpen,
    onClose,
    agent,
    onAlert,
    onComplete
}) => {
    // State for test input
    const [channel, setChannel] = useState('general')
    const [message, setMessage] = useState('')
    const [isTesting, setIsTesting] = useState(false)

    // State for test result
    const [showResult, setShowResult] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [resultMessage, setResultMessage] = useState('')

    // Update message whenever agent changes or modal opens
    useEffect(() => {
        if (agent && isOpen) {
            setMessage(`Test message from PySpur agent "${agent.name}"`)
            setChannel('general')
            setShowResult(false) // Reset result view when opening
        }
    }, [agent, isOpen])

    const handleTest = async () => {
        if (!agent) return

        if (!agent.workflow_id) {
            onAlert?.('Please associate a workflow with this agent first', 'warning')
            setIsSuccess(false)
            setResultMessage('Please associate a workflow with this agent first')
            setShowResult(true)
            return
        }

        if (!agent.has_bot_token) {
            onAlert?.('A bot token is required for sending messages. Please configure one first.', 'warning')
            setIsSuccess(false)
            setResultMessage('A bot token is required for sending messages. Please configure one first.')
            setShowResult(true)
            return
        }

        setIsTesting(true)
        try {
            const response = await sendTestMessage(channel, message, agent.id)
            if (response.success) {
                const successMsg = 'Test message sent successfully!'
                onAlert?.(successMsg, 'success')
                setIsSuccess(true)
                setResultMessage(successMsg)
                onComplete?.({ success: true, message: successMsg })
            } else {
                onAlert?.(response.message, 'danger')
                setIsSuccess(false)
                setResultMessage(response.message)
                onComplete?.({ success: false, message: response.message })
            }
            setShowResult(true)
        } catch (error: any) {
            console.error('Error sending test message:', error)

            // Extract the server error message if available
            let errorMessage = 'Failed to send test message'
            if (error.response?.data?.detail) {
                if (error.response.data.detail === "No Slack bot token configured") {
                    errorMessage = 'No Slack bot token configured. Please add a bot token in the agent settings first.'
                } else if (error.response.data.detail.includes("installation") ||
                          error.response.data.detail.includes("AuthorizeResult")) {
                    errorMessage = 'Your Slack installation is no longer available. Please reinstall the app to reconnect.'
                } else {
                    errorMessage = `Failed to send test message: ${error.response.data.detail}`
                }
            }

            onAlert?.(errorMessage, 'danger')
            setIsSuccess(false)
            setResultMessage(errorMessage)
            onComplete?.({ success: false, message: errorMessage, error })
            setShowResult(true)
        } finally {
            setIsTesting(false)
        }
    }

    const handleClose = () => {
        setShowResult(false)
        onClose()
    }

    // Render the test input view
    const renderTestInput = () => (
        <ModalContent>
            <ModalHeader className="flex gap-1">
                <div className="flex items-center gap-2">
                    <Icon icon="solar:test-tube-bold" width={24} className="text-primary" />
                    Test Slack Connection
                </div>
            </ModalHeader>
            <ModalBody>
                <div className="space-y-4">
                    <div className="bg-default-100 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon icon="logos:slack-icon" width={20} />
                            <span className="font-medium">Connection Details</span>
                        </div>
                        <div className="space-y-2 text-sm">
                            <div className="flex gap-2">
                                <span className="font-medium w-24">Agent:</span>
                                <span>{agent?.name || "Unknown"}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="font-medium w-24">Workspace:</span>
                                <span>{agent?.slack_team_name || "Unknown"}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="font-medium w-24">Bot Token:</span>
                                <span>{agent?.has_bot_token ? "✓ Configured" : "⚠️ Not Configured"}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="font-medium w-24">Workflow:</span>
                                <span>{agent?.workflow_id ? "✓ Associated" : "⚠️ Not Associated"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Input
                            label="Channel Name"
                            placeholder="Enter channel name (without #)"
                            value={channel}
                            onChange={(e) => setChannel(e.target.value)}
                            startContent={<Icon icon="lucide:hash" width={16} />}
                            description="The Slack channel where the test message will be sent"
                        />

                        <Input
                            label="Test Message"
                            placeholder="Enter a test message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            startContent={<Icon icon="lucide:message-square" width={16} />}
                            description="The message that will be sent to the channel"
                        />
                    </div>

                    <div className="text-sm text-default-500">
                        <p>Make sure your Slack app has been invited to the channel and has the necessary permissions.</p>
                    </div>
                </div>
            </ModalBody>
            <ModalFooter>
                <Button color="danger" variant="light" onPress={handleClose}>
                    Cancel
                </Button>
                <Button
                    color="primary"
                    onPress={handleTest}
                    isDisabled={!channel || !message || isTesting || !agent?.has_bot_token}
                    startContent={isTesting ? <Spinner size="sm" /> : null}
                >
                    {isTesting ? "Sending..." : "Send Test Message"}
                </Button>
            </ModalFooter>
        </ModalContent>
    )

    // Render the test result view
    const renderTestResult = () => (
        <ModalContent>
            <ModalHeader className="flex gap-1">
                <div className="flex items-center gap-2">
                    <Icon icon={isSuccess ? "solar:check-circle-bold" : "solar:close-circle-bold"}
                          className={isSuccess ? "text-success" : "text-danger"}
                          width={24} />
                    {isSuccess ? "Test Connection Successful" : "Test Connection Failed"}
                </div>
            </ModalHeader>
            <ModalBody>
                {isSuccess ? (
                    <div className="space-y-4">
                        <p>{resultMessage}</p>
                        <div className="bg-success-50 dark:bg-success-900/20 p-4 rounded-lg border border-success-200 dark:border-success-800">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon icon="logos:slack-icon" width={20} />
                                <span className="font-medium">Connection Details</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex gap-2">
                                    <span className="font-medium">Agent:</span>
                                    <span>{agent?.name || "Unknown"}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="font-medium">Channel:</span>
                                    <span>#{channel}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="font-medium">Workspace:</span>
                                    <span>{agent?.slack_team_name || "Unknown"}</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-sm text-default-500">
                            Check your Slack channel to see the test message.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-danger">{resultMessage || "We couldn't send a message to Slack. Please check your configuration."}</p>
                        <div className="bg-danger-50 dark:bg-danger-900/20 p-4 rounded-lg border border-danger-200 dark:border-danger-800">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon icon="solar:danger-triangle-bold" width={20} className="text-danger" />
                                <span className="font-medium">Troubleshooting Tips</span>
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                <li>Verify that your bot token is correctly configured</li>
                                <li>Make sure your app is invited to the #{channel} channel</li>
                                <li>Check that your app has the necessary permissions</li>
                            </ul>
                        </div>
                    </div>
                )}
            </ModalBody>
            <ModalFooter>
                {isSuccess ? (
                    <Button color="primary" onPress={handleClose}>
                        Close
                    </Button>
                ) : (
                    <>
                        <Button color="danger" variant="light" onPress={handleClose}>
                            Cancel
                        </Button>
                        <Button color="primary" onPress={() => setShowResult(false)}>
                            Try Again
                        </Button>
                    </>
                )}
            </ModalFooter>
        </ModalContent>
    )

    return (
        <Modal isOpen={isOpen} onClose={handleClose} size="3xl" scrollBehavior="inside">
            {showResult ? renderTestResult() : renderTestInput()}
        </Modal>
    )
}

export default SlackTestConnection