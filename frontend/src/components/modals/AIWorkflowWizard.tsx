import React, { useState } from 'react'
import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Spinner,
    Textarea,
    useDisclosure
} from '@heroui/react'
import { generateWorkflowWithAI, WorkflowGenerationRequest, createWorkflow } from '@/utils/api'
import { WorkflowCreateRequest, WorkflowResponse } from '@/types/api_types/workflowSchemas'

interface AIWorkflowWizardProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (workflow: WorkflowResponse) => void
}

type WizardStep = 'purpose' | 'details' | 'inputs' | 'review' | 'generating'

const AIWorkflowWizard: React.FC<AIWorkflowWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    // Wizard state
    const [currentStep, setCurrentStep] = useState<WizardStep>('purpose')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Form data
    const [purpose, setPurpose] = useState('')
    const [description, setDescription] = useState('')
    const [inputs, setInputs] = useState<Record<string, string>>({})
    const [outputs, setOutputs] = useState<Record<string, string>>({})

    // Input/output management
    const [inputKey, setInputKey] = useState('')
    const [inputValue, setInputValue] = useState('')
    const [outputKey, setOutputKey] = useState('')
    const [outputValue, setOutputValue] = useState('')

    // Templates for common types of workflows
    const templates = [
        { label: "Custom (Define your own)", value: "custom" },
        { label: "Data Processing Pipeline", value: "data_processing" },
        { label: "Content Generation", value: "content_generation" },
        { label: "Web Scraping & Analysis", value: "web_scraping" },
        { label: "Document Processing", value: "document_processing" },
        { label: "Social Media Integration", value: "social_media" },
    ]
    const [selectedTemplate, setSelectedTemplate] = useState<string>("custom")

    const addInput = () => {
        if (inputKey && inputValue) {
            setInputs(prev => ({ ...prev, [inputKey]: inputValue }))
            setInputKey('')
            setInputValue('')
        }
    }

    const removeInput = (key: string) => {
        const newInputs = { ...inputs }
        delete newInputs[key]
        setInputs(newInputs)
    }

    const addOutput = () => {
        if (outputKey && outputValue) {
            setOutputs(prev => ({ ...prev, [outputKey]: outputValue }))
            setOutputKey('')
            setOutputValue('')
        }
    }

    const removeOutput = (key: string) => {
        const newOutputs = { ...outputs }
        delete newOutputs[key]
        setOutputs(newOutputs)
    }

    const handleSelectTemplate = (template: string) => {
        setSelectedTemplate(template)

        // Pre-fill form based on template
        switch (template) {
            case 'data_processing':
                setPurpose('Data processing and transformation pipeline')
                setDescription('Create a workflow that takes input data, processes it through multiple transformation steps, and outputs the processed results.')
                setInputs({ 'data_source': 'CSV or JSON data to process' })
                setOutputs({ 'processed_data': 'Transformed and processed data' })
                break;
            case 'content_generation':
                setPurpose('AI-powered content generation')
                setDescription('Generate creative content based on user prompts, refine it, and deliver it in the requested format.')
                setInputs({ 'prompt': 'User instructions for content generation', 'style': 'Style/tone of content' })
                setOutputs({ 'content': 'Generated content' })
                break;
            case 'web_scraping':
                setPurpose('Web scraping and content analysis')
                setDescription('Scrape content from websites, process and analyze the data, and extract insights.')
                setInputs({ 'url': 'Website URL to scrape' })
                setOutputs({ 'analysis': 'Analysis results and insights' })
                break;
            case 'document_processing':
                setPurpose('Document processing and information extraction')
                setDescription('Process documents (PDF, DOCX, etc.), extract key information, and perform analysis.')
                setInputs({ 'document': 'Document to process' })
                setOutputs({ 'extracted_info': 'Extracted information', 'summary': 'Document summary' })
                break;
            case 'social_media':
                setPurpose('Social media content generation and posting')
                setDescription('Generate content for social media platforms and post it automatically.')
                setInputs({ 'topic': 'Content topic', 'platform': 'Target social media platform' })
                setOutputs({ 'post_status': 'Status of the post' })
                break;
            case 'custom':
                setPurpose('')
                setDescription('')
                setInputs({})
                setOutputs({})
                break;
        }
    }

    const handleNext = () => {
        switch (currentStep) {
            case 'purpose':
                if (!purpose.trim()) {
                    setError('Please enter a purpose for your workflow')
                    return
                }
                setError(null)
                setCurrentStep('details')
                break;
            case 'details':
                if (!description.trim()) {
                    setError('Please enter a description for your workflow')
                    return
                }
                setError(null)
                setCurrentStep('inputs')
                break;
            case 'inputs':
                setError(null)
                setCurrentStep('review')
                break;
            case 'review':
                handleGenerateWorkflow()
                break;
        }
    }

    const handleBack = () => {
        switch (currentStep) {
            case 'details':
                setCurrentStep('purpose')
                break;
            case 'inputs':
                setCurrentStep('details')
                break;
            case 'review':
                setCurrentStep('inputs')
                break;
        }
    }

    const handleGenerateWorkflow = async () => {
        setIsLoading(true)
        setError(null)
        setCurrentStep('generating')

        try {
            const request: WorkflowGenerationRequest = {
                purpose,
                description,
                inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
                outputs: Object.keys(outputs).length > 0 ? outputs : undefined
            }

            // First call the AI endpoint to generate the workflow
            const generatedWorkflow = await generateWorkflowWithAI(request)

            // Then create the actual workflow
            const workflowRequest: WorkflowCreateRequest = {
                name: generatedWorkflow.name,
                description: generatedWorkflow.description,
                definition: generatedWorkflow.definition
            }

            const createdWorkflow = await createWorkflow(workflowRequest)

            // Notify success
            onSuccess(createdWorkflow)

            // Reset form and close
            resetForm()
            onClose()
        } catch (error: any) {
            console.error('Error generating workflow:', error)
            setError(error?.response?.data?.detail || 'Failed to generate workflow. Please try again.')
            setCurrentStep('review')
        } finally {
            setIsLoading(false)
        }
    }

    const resetForm = () => {
        setPurpose('')
        setDescription('')
        setInputs({})
        setOutputs({})
        setCurrentStep('purpose')
        setError(null)
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                resetForm()
                onClose()
            }}
            size="2xl"
        >
            <ModalContent>
                <ModalHeader>
                    <div className="text-xl font-semibold">
                        {currentStep === 'purpose' && 'Create Workflow with AI - Purpose'}
                        {currentStep === 'details' && 'Create Workflow with AI - Details'}
                        {currentStep === 'inputs' && 'Create Workflow with AI - Inputs & Outputs'}
                        {currentStep === 'review' && 'Create Workflow with AI - Review'}
                        {currentStep === 'generating' && 'Creating Your Workflow...'}
                    </div>
                </ModalHeader>
                <ModalBody>
                    {error && (
                        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-md">
                            {error}
                        </div>
                    )}

                    {currentStep === 'purpose' && (
                        <div className="space-y-4">
                            <div>
                                <p className="mb-2">What type of workflow would you like to create?</p>
                                <Select
                                    label="Workflow Type"
                                    value={selectedTemplate}
                                    onChange={(e) => handleSelectTemplate(e.target.value)}
                                >
                                    {templates.map((template) => (
                                        <SelectItem key={template.value} value={template.value}>
                                            {template.label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <p className="mb-2">What is the main purpose of this workflow?</p>
                                <Textarea
                                    placeholder="e.g., Summarize blog posts and send highlights to Slack"
                                    value={purpose}
                                    onChange={(e) => setPurpose(e.target.value)}
                                    rows={3}
                                />
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Be specific about what you want the workflow to accomplish.
                                </p>
                            </div>
                        </div>
                    )}

                    {currentStep === 'details' && (
                        <div className="space-y-4">
                            <div>
                                <p className="mb-2">Please provide more details about how this workflow should operate:</p>
                                <Textarea
                                    placeholder="e.g., The workflow should scrape a provided blog post URL, summarize the key points using an LLM, and send the summary to a Slack channel."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={5}
                                />
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Include specific steps, data transformations, or integrations you need.
                                </p>
                            </div>
                        </div>
                    )}

                    {currentStep === 'inputs' && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <h3 className="font-medium">Define Workflow Inputs</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    What data will users need to provide when running this workflow?
                                </p>

                                <div className="space-y-2">
                                    {Object.entries(inputs).map(([key, value]) => (
                                        <div key={key} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-content1 rounded">
                                            <div>
                                                <span className="font-medium">{key}</span>: {value}
                                            </div>
                                            <Button
                                                color="danger"
                                                variant="light"
                                                size="sm"
                                                onClick={() => removeInput(key)}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Input name"
                                        value={inputKey}
                                        onChange={(e) => setInputKey(e.target.value)}
                                    />
                                    <Input
                                        placeholder="Description"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                    />
                                    <Button onClick={addInput}>Add</Button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-medium">Define Expected Outputs</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    What data should the workflow produce? (Optional)
                                </p>

                                <div className="space-y-2">
                                    {Object.entries(outputs).map(([key, value]) => (
                                        <div key={key} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-content1 rounded">
                                            <div>
                                                <span className="font-medium">{key}</span>: {value}
                                            </div>
                                            <Button
                                                color="danger"
                                                variant="light"
                                                size="sm"
                                                onClick={() => removeOutput(key)}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Output name"
                                        value={outputKey}
                                        onChange={(e) => setOutputKey(e.target.value)}
                                    />
                                    <Input
                                        placeholder="Description"
                                        value={outputValue}
                                        onChange={(e) => setOutputValue(e.target.value)}
                                    />
                                    <Button onClick={addOutput}>Add</Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 'review' && (
                        <div className="space-y-4">
                            <h3 className="font-medium">Review Your Workflow Requirements</h3>

                            <div className="space-y-2">
                                <div className="p-3 bg-gray-50 dark:bg-content1 rounded">
                                    <h4 className="font-semibold">Purpose</h4>
                                    <p>{purpose}</p>
                                </div>

                                <div className="p-3 bg-gray-50 dark:bg-content1 rounded">
                                    <h4 className="font-semibold">Details</h4>
                                    <p>{description}</p>
                                </div>

                                {Object.keys(inputs).length > 0 && (
                                    <div className="p-3 bg-gray-50 dark:bg-content1 rounded">
                                        <h4 className="font-semibold">Inputs</h4>
                                        <ul className="list-disc pl-5">
                                            {Object.entries(inputs).map(([key, value]) => (
                                                <li key={key}>
                                                    <span className="font-medium">{key}</span>: {value}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {Object.keys(outputs).length > 0 && (
                                    <div className="p-3 bg-gray-50 dark:bg-content1 rounded">
                                        <h4 className="font-semibold">Expected Outputs</h4>
                                        <ul className="list-disc pl-5">
                                            {Object.entries(outputs).map(([key, value]) => (
                                                <li key={key}>
                                                    <span className="font-medium">{key}</span>: {value}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Click "Generate Workflow" below to create your workflow based on these requirements.
                                This may take up to a minute as our AI designs your workflow.
                            </p>
                        </div>
                    )}

                    {currentStep === 'generating' && (
                        <div className="py-10 flex flex-col items-center justify-center space-y-4">
                            <Spinner size="lg" />
                            <p>Generating your custom workflow...</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Our AI is designing a workflow based on your requirements.
                                This may take up to a minute.
                            </p>
                        </div>
                    )}
                </ModalBody>
                <ModalFooter>
                    {currentStep !== 'generating' && (
                        <>
                            <Button color="default" variant="light" onClick={onClose}>
                                Cancel
                            </Button>
                            {currentStep !== 'purpose' && (
                                <Button color="default" onClick={handleBack}>
                                    Back
                                </Button>
                            )}
                            <Button color="primary" onClick={handleNext}>
                                {currentStep === 'review' ? 'Generate Workflow' : 'Next'}
                            </Button>
                        </>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default AIWorkflowWizard