import {
    Accordion,
    AccordionItem,
    Badge,
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Textarea
} from '@heroui/react'
import { Icon as IconifyIcon } from '@iconify/react'
import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { setApiKey } from '../../utils/api'

interface SlackSetupGuideProps {
    onClose: () => void;
    onConnectClick: () => void;
    setupInfo?: any;
    onGoToSettings?: () => void;
    onTokenConfigured?: () => void;
}

const SlackSetupGuide: React.FC<SlackSetupGuideProps> = ({
    onClose,
    onConnectClick,
    setupInfo,
    onGoToSettings,
    onTokenConfigured
}) => {
    const router = useRouter()
    const [botToken, setBotToken] = useState('')
    const [isConfiguring, setIsConfiguring] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')

    const handleSaveToken = async () => {
        if (!botToken || !botToken.startsWith('xoxb-')) {
            setErrorMessage('Please enter a valid bot token (must start with xoxb-)')
            return
        }

        setIsConfiguring(true)
        setErrorMessage('')

        try {
            console.log('Setting Slack token...')
            // Set the API key directly
            await setApiKey('SLACK_BOT_TOKEN', botToken)
            console.log('Slack token set successfully')

            // Call the token configured callback
            if (onTokenConfigured) {
                console.log('Calling onTokenConfigured callback')
                onTokenConfigured()
            }

            // Close the modal
            console.log('Closing SlackSetupGuide modal')
            onClose()
        } catch (error) {
            console.error('Error saving Slack token:', error)
            setErrorMessage('Failed to save token. Please check your token and try again.')
        } finally {
            setIsConfiguring(false)
        }
    }

    return (
        <Modal isOpen={true} onClose={onClose} size="2xl" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader className="flex items-center gap-2">
                    <IconifyIcon icon="logos:slack-icon" width={24} />
                    <span>Slack Integration Setup</span>
                </ModalHeader>
                <ModalBody>
                    <p className="mb-4">
                        Set up Slack integration by providing your Bot Token directly. After configuration, you'll create your first Slack agent.
                    </p>

                    <Accordion>
                        <AccordionItem
                            key="create-app"
                            subtitle="Creating a Slack app"
                            title={
                                <div className="flex items-center">
                                    <div className="bg-primary-50 dark:bg-primary-900 rounded-full h-6 w-6 flex items-center justify-center mr-2">
                                        <span className="text-primary font-semibold text-sm">1</span>
                                    </div>
                                    <span className="font-medium">Create a Slack App</span>
                                </div>
                            }
                        >
                            <div className="pl-8 text-sm space-y-2">
                                <p>To create a new Slack app:</p>
                                <ol className="list-decimal list-inside space-y-1 pl-2">
                                    <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary underline">Slack API Apps page</a></li>
                                    <li>Click <strong>Create New App</strong> → <strong>From scratch</strong></li>
                                    <li>Name your app (e.g., &quot;PySpur Bot&quot;)</li>
                                    <li>Select the workspace where you want to install the app</li>
                                </ol>
                            </div>
                        </AccordionItem>

                        <AccordionItem
                            key="bot-permissions"
                            subtitle="Setting up bot permissions"
                            title={
                                <div className="flex items-center">
                                    <div className="bg-primary-50 dark:bg-primary-900 rounded-full h-6 w-6 flex items-center justify-center mr-2">
                                        <span className="text-primary font-semibold text-sm">2</span>
                                    </div>
                                    <span className="font-medium">Configure Bot Permissions</span>
                                </div>
                            }
                        >
                            <div className="pl-8 text-sm space-y-2">
                                <p>Configure the bot permissions for your app:</p>
                                <ol className="list-decimal list-inside space-y-1 pl-2">
                                    <li>In your app settings, go to <strong>OAuth & Permissions</strong></li>
                                    <li>Under <strong>Bot Token Scopes</strong>, add the following scopes:
                                        <div className="bg-default-100 p-2 rounded mt-1 font-mono text-xs">
                                            channels:read, chat:write, team:read, app_mentions:read, im:read, im:history
                                        </div>
                                    </li>
                                    <li>Click <strong>Install to Workspace</strong> at the top of the page</li>
                                    <li>After installation, find your <strong>Bot User OAuth Token</strong> (starts with xoxb-)</li>
                                </ol>
                            </div>
                        </AccordionItem>

                        <AccordionItem
                            key="enter-token"
                            subtitle="Enter your bot token"
                            title={
                                <div className="flex items-center">
                                    <div className="bg-primary-50 dark:bg-primary-900 rounded-full h-6 w-6 flex items-center justify-center mr-2">
                                        <span className="text-primary font-semibold text-sm">3</span>
                                    </div>
                                    <span className="font-medium">Enter Bot Token</span>
                                </div>
                            }
                        >
                            <div className="pl-8 text-sm space-y-3">
                                <p>Enter your Slack Bot User OAuth Token:</p>

                                <Input
                                    label="Bot Token"
                                    placeholder="xoxb-..."
                                    value={botToken}
                                    onChange={(e) => setBotToken(e.target.value)}
                                    description="This token starts with 'xoxb-' and can be found in your Slack App's OAuth & Permissions page"
                                    type="password"
                                    className="max-w-lg"
                                    isInvalid={!!errorMessage}
                                    errorMessage={errorMessage}
                                />

                                <Button
                                    color="primary"
                                    className="mt-2"
                                    onPress={handleSaveToken}
                                    isLoading={isConfiguring}
                                    isDisabled={!botToken || isConfiguring}
                                >
                                    Save Token and Continue to Agent Setup
                                </Button>

                                <p className="text-sm text-default-500 mt-2">
                                    After saving your token, you&apos;ll be guided to create your first Slack agent.
                                </p>
                            </div>
                        </AccordionItem>

                        <AccordionItem
                            key="create-agent"
                            subtitle="Create a Slack Agent"
                            title={
                                <div className="flex items-center">
                                    <div className="bg-primary-50 dark:bg-primary-900 rounded-full h-6 w-6 flex items-center justify-center mr-2">
                                        <span className="text-primary font-semibold text-sm">4</span>
                                    </div>
                                    <span className="font-medium">Create Your First Slack Agent</span>
                                </div>
                            }
                        >
                            <div className="pl-8 text-sm space-y-2">
                                <p>After configuring your token, you&apos;ll be prompted to:</p>
                                <ol className="list-decimal list-inside space-y-1 pl-2">
                                    <li>Create a personalized Slack agent</li>
                                    <li>Select which workflow to connect to your Slack agent</li>
                                    <li>Configure trigger settings (mentions, direct messages, keywords)</li>
                                    <li>Complete the setup to start using Slack with your workflows</li>
                                </ol>
                                <p className="mt-2 text-default-500">
                                    You can create multiple agents for different purposes later from the Slack integration panel.
                                </p>
                            </div>
                        </AccordionItem>

                        <AccordionItem
                            key="event-subscription"
                            subtitle="Setting up Events API"
                            title={
                                <div className="flex items-center">
                                    <div className="bg-primary-50 dark:bg-primary-900 rounded-full h-6 w-6 flex items-center justify-center mr-2">
                                        <span className="text-primary font-semibold text-sm">5</span>
                                    </div>
                                    <span className="font-medium">Configure Event Subscriptions (Optional)</span>
                                </div>
                            }
                        >
                            <div className="pl-8 text-sm space-y-2">
                                <p>To enable automatic triggers from Slack events:</p>
                                <ol className="list-decimal list-inside space-y-1 pl-2">
                                    <li>In your app settings, go to <strong>Event Subscriptions</strong></li>
                                    <li>Enable events and set the Request URL to your PySpur instance:
                                        <div className="bg-default-100 p-2 rounded mt-1 font-mono text-xs">
                                            {`${window.location.origin}/api/slack/events`}
                                        </div>
                                    </li>
                                    <li>Under <strong>Subscribe to bot events</strong>, add:
                                        <ul className="list-disc list-inside pl-4 mt-1">
                                            <li>message.im (for direct messages)</li>
                                            <li>message.channels (for channel messages)</li>
                                            <li>app_mention (for @mentions)</li>
                                        </ul>
                                    </li>
                                    <li>Save changes and reinstall the app if prompted</li>
                                </ol>
                            </div>
                        </AccordionItem>
                    </Accordion>
                </ModalBody>
                <ModalFooter>
                    <Button variant="flat" onPress={onClose}>
                        Cancel
                    </Button>
                    <Button
                        color="primary"
                        size="sm"
                        className="mt-2"
                        onPress={() => {
                            onClose();
                            if (typeof onGoToSettings === 'function') {
                                onGoToSettings();
                            }
                        }}
                        startContent={<IconifyIcon icon="lucide:settings" width={16} />}
                    >
                        Go to Settings
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default SlackSetupGuide