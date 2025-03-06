import {
    Alert,
    Button,
    Card,
    CardBody,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Radio,
    RadioGroup,
    Textarea,
    Tooltip,
    CheckboxGroup,
    Checkbox
} from '@heroui/react'
import { Icon } from '@iconify/react'
import React, { useState, useEffect } from 'react'
import { generateMessage } from '../../../utils/api'
import axios from 'axios'

interface MessageGeneratorProps {
    nodeID: string
    messageType: 'system' | 'user'
    currentMessage: string
    onMessageGenerated: (newMessage: string) => void
    readOnly?: boolean
    incomingSchema?: string[]
}

const MessageGenerator: React.FC<MessageGeneratorProps> = ({
    nodeID,
    messageType,
    currentMessage,
    onMessageGenerated,
    readOnly = false,
    incomingSchema = [],
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [description, setDescription] = useState('')
    const [generationType, setGenerationType] = useState<'new' | 'enhance'>('new')
    const [isGenerating, setIsGenerating] = useState(false)
    const [generationError, setGenerationError] = useState('')
    const [hasOpenAIKey, setHasOpenAIKey] = useState<boolean>(false)
    const [selectedVariables, setSelectedVariables] = useState<string[]>([])

    // Check for OpenAI API key on mount
    useEffect(() => {
        const checkOpenAIKey = async () => {
            try {
                const response = await axios.get('/api/env-mgmt/OPENAI_API_KEY')
                setHasOpenAIKey(!!response.data.value)
            } catch (error) {
                setHasOpenAIKey(false)
            }
        }
        checkOpenAIKey()
    }, [])

    // Select all variables by default when modal opens
    useEffect(() => {
        if (isOpen && incomingSchema && incomingSchema.length > 0) {
            setSelectedVariables(incomingSchema)
        }
    }, [isOpen, incomingSchema])

    // Helper function to reset modal state
    const resetModalState = () => {
        setDescription('')
        setGenerationError('')
        setGenerationType('new')
        setSelectedVariables([])
        setIsOpen(false)
    }

    const handleGenerateMessage = async () => {
        if (!description.trim()) {
            setGenerationError('Please enter a description')
            return
        }

        setIsGenerating(true)
        setGenerationError('')

        try {
            const response = await generateMessage({
                description: description,
                message_type: messageType,
                existing_message: generationType === 'enhance' ? currentMessage : undefined,
                available_variables: selectedVariables.length > 0 ? selectedVariables : undefined,
            })

            onMessageGenerated(response.message)
            resetModalState()
        } catch (error: any) {
            setGenerationError(error.response?.data?.detail || 'Failed to generate message')
        } finally {
            setIsGenerating(false)
        }
    }

    const renderGenerateButton = () => {
        if (readOnly) return null

        const buttonLabel = `AI Generate ${messageType === 'system' ? 'System Message' : 'Prompt'}`

        const button = (
            <Button
                size="sm"
                color="primary"
                variant="light"
                startContent={<Icon icon="solar:magic-stick-linear" width={20} />}
                onClick={() => setIsOpen(true)}
                isDisabled={!hasOpenAIKey || readOnly}
            >
                AI Generate
            </Button>
        )

        if (!hasOpenAIKey) {
            return (
                <Tooltip
                    content="OpenAI API key is required for AI message generation. Please add your API key in the settings."
                    placement="top"
                >
                    {button}
                </Tooltip>
            )
        }

        return button
    }

    // Get appropriate placeholder text based on message type
    const getPlaceholderText = () => {
        if (messageType === 'system') {
            return generationType === 'new'
                ? "Example: Create a system message for a coding assistant that specializes in debugging JavaScript code"
                : "Example: Make the assistant more detailed in its explanations and add instructional guidance"
        } else {
            return generationType === 'new'
                ? "Example: Create a prompt that asks for a detailed analysis of quarterly financial data with trend identification"
                : "Example: Add a request for the response to include actionable recommendations"
        }
    }

    return (
        <>
            {generationError && (
                <Alert color="danger" className="mb-2">
                    <div className="flex items-center gap-2">
                        <span>{generationError}</span>
                    </div>
                </Alert>
            )}

            {renderGenerateButton()}

            <Modal
                isOpen={isOpen}
                onClose={resetModalState}
                size="2xl"
                isDismissable={!isGenerating}
                hideCloseButton={isGenerating}
            >
                <ModalContent>
                    <ModalHeader className="flex flex-col gap-1">
                        Generate {messageType === 'system' ? 'System Message' : 'User Prompt'}
                    </ModalHeader>
                    <ModalBody>
                        <RadioGroup
                            value={generationType}
                            onValueChange={(value) => setGenerationType(value as 'new' | 'enhance')}
                            className="mb-4"
                            isDisabled={isGenerating}
                        >
                            <Radio value="new">Create New Message</Radio>
                            <Radio
                                value="enhance"
                                isDisabled={!currentMessage.trim() || isGenerating}
                                description={!currentMessage.trim() ? "No existing message to enhance" : undefined}
                            >
                                Enhance Existing Message
                            </Radio>
                        </RadioGroup>

                        {generationType === 'enhance' && currentMessage.trim() && (
                            <Card className="mb-4">
                                <CardBody>
                                    <div className="text-sm font-semibold mb-2">Current Message:</div>
                                    <div className="bg-default-100 p-3 rounded-md text-sm whitespace-pre-wrap">
                                        {currentMessage}
                                    </div>
                                </CardBody>
                            </Card>
                        )}

                        {incomingSchema && incomingSchema.length > 0 && (
                            <Card className="mb-4">
                                <CardBody>
                                    <div className="text-sm font-semibold mb-2">Available Template Variables:</div>
                                    <div className="mb-2 text-xs text-default-500">
                                        Select which variables should be included in your generated message:
                                    </div>

                                    <div className="flex justify-between items-center gap-2 mb-2">
                                        <div className="text-xs text-default-500">
                                            {selectedVariables.length} of {incomingSchema.length} variables selected
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="flat"
                                                onClick={() => setSelectedVariables([...incomingSchema])}
                                                isDisabled={isGenerating}
                                            >
                                                Select All
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="flat"
                                                onClick={() => setSelectedVariables([])}
                                                isDisabled={isGenerating}
                                            >
                                                Deselect All
                                            </Button>
                                        </div>
                                    </div>

                                    <CheckboxGroup
                                        value={selectedVariables}
                                        onValueChange={setSelectedVariables}
                                        className="mt-2"
                                    >
                                        {incomingSchema.map((variable) => (
                                            <Checkbox
                                                key={variable}
                                                value={variable}
                                                isDisabled={isGenerating}
                                            >
                                                <code className="text-primary">{`{{ ${variable} }}`}</code>
                                            </Checkbox>
                                        ))}
                                    </CheckboxGroup>

                                    <div className="mt-2 text-xs text-default-500">
                                        These variables will be used in your message template and will be replaced with actual values at runtime.
                                    </div>
                                </CardBody>
                            </Card>
                        )}

                        <Textarea
                            label={generationType === 'new'
                                ? `Describe the ${messageType === 'system' ? 'system message' : 'user prompt'} you want to generate`
                                : `Describe how you want to enhance the ${messageType === 'system' ? 'system message' : 'user prompt'}`
                            }
                            placeholder={getPlaceholderText()}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="mb-2"
                            isDisabled={isGenerating}
                            minRows={5}
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            size="sm"
                            variant="light"
                            onClick={resetModalState}
                            isDisabled={isGenerating}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            color="primary"
                            onClick={handleGenerateMessage}
                            isLoading={isGenerating}
                            isDisabled={isGenerating}
                        >
                            Generate
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    )
}

export default MessageGenerator