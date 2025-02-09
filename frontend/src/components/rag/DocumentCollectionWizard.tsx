import React, { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'
import {
    Button,
    Card,
    CardBody,
    Input,
    Textarea,
    Select,
    SelectItem,
    Progress,
    Divider,
    Switch,
    Tooltip,
    Chip,
    Alert,
    Spinner,
    RadioGroup,
    Radio,
    Slider,
} from '@heroui/react'
import { Info, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react'
import { createDocumentCollection } from '@/utils/api'
import type { DocumentCollectionCreateRequest } from '@/utils/api'
import { motion, AnimatePresence } from 'framer-motion'
import FileUploadBox from '../FileUploadBox'
import ChunkEditor from './ChunkEditor'

interface TextProcessingConfig {
    name: string
    description: string
    chunk_token_size: number
    min_chunk_size_chars: number
    use_vision_model: boolean
    vision_model?: string
    vision_provider?: string
    chunkingMode: 'automatic' | 'manual'
    template: {
        enabled: boolean
        template: string
        metadata_template: { type: string }
    }
}

const steps = ['Upload Documents', 'Configure Processing', 'Configure Templates', 'Create Collection']

const generateRandomName = () => {
    const adjectives = [
        'Smart',
        'Brilliant',
        'Dynamic',
        'Quantum',
        'Neural',
        'Cosmic',
        'Intelligent',
        'Advanced',
        'Strategic',
        'Innovative',
    ]
    const nouns = [
        'Atlas',
        'Nexus',
        'Matrix',
        'Archive',
        'Library',
        'Vault',
        'Repository',
        'Database',
        'Collection',
        'Hub',
    ]
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)]
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
    const now = new Date()
    const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
    return `${randomAdjective} ${randomNoun} - ${timestamp}`
}

export const DocumentCollectionWizard = () => {
    const router = useRouter()
    const [activeStep, setActiveStep] = useState(0)
    const [files, setFiles] = useState<File[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [alert, setAlert] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)
    const [nameAlert, setNameAlert] = useState<string | null>(null)
    const [config, setConfig] = useState<TextProcessingConfig>({
        name: '',
        description: '',
        chunk_token_size: 1000,
        min_chunk_size_chars: 100,
        use_vision_model: true,
        vision_model: 'gpt-4o-mini',
        vision_provider: 'openai',
        chunkingMode: 'automatic',
        template: {
            enabled: false,
            template: '{{ text }}',
            metadata_template: { type: 'text_chunk' },
        },
    })

    // Clear alert after 3 seconds
    useEffect(() => {
        if (alert) {
            const timer = setTimeout(() => {
                setAlert(null)
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [alert])

    // Clear name alert after 3 seconds
    useEffect(() => {
        if (nameAlert) {
            const timer = setTimeout(() => {
                setNameAlert(null)
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [nameAlert])

    const handleFilesChange = (newFiles: File[]) => {
        setFiles(newFiles)
    }

    const handleSubmit = async () => {
        try {
            setIsSubmitting(true)
            console.log('Submitting...')
            console.log(config)
            const requestData: DocumentCollectionCreateRequest = {
                name: config.name,
                description: config.description,
                text_processing: {
                    chunk_token_size:
                        files.length === 0
                            ? 1000
                            : config.chunkingMode === 'automatic'
                              ? 1000
                              : config.chunk_token_size,
                    min_chunk_size_chars:
                        files.length === 0
                            ? 100
                            : config.chunkingMode === 'automatic'
                              ? 100
                              : config.min_chunk_size_chars,
                    min_chunk_length_to_embed: 10,
                    embeddings_batch_size: 32,
                    max_num_chunks: 1000,
                    use_vision_model: files.length === 0 ? false : config.use_vision_model,
                    template: config.template.enabled
                        ? {
                              enabled: config.template.enabled,
                              template: config.template.template,
                              metadata_template: config.template.metadata_template,
                          }
                        : undefined,
                    ...(config.use_vision_model &&
                        config.vision_model && {
                            vision_model: config.vision_model,
                            vision_provider: config.vision_provider,
                        }),
                },
            }

            const response = await createDocumentCollection(requestData, files.length > 0 ? files : undefined)
            setAlert({ type: 'success', message: 'Document collection created successfully' })
            router.push(`/rag/collections/${response.id}`)
        } catch (error) {
            console.error('Error creating collection:', error)
            setAlert({ type: 'danger', message: 'Error creating document collection' })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleNext = () => {
        if (activeStep < steps.length - 1) {
            // If we're on the first step and no name is provided, generate one
            if (activeStep === 0 && !config.name.trim()) {
                const randomName = generateRandomName()
                setConfig((prev) => ({ ...prev, name: randomName }))
                setNameAlert(`Using generated name: ${randomName}`)
            }

            // Skip chunking step if no files are uploaded
            if (activeStep === 0 && files.length === 0) {
                setActiveStep(2) // Skip to template step
            } else {
                setActiveStep((prevStep) => prevStep + 1)
            }
        } else {
            handleSubmit()
        }
    }

    const handleBack = () => {
        // Handle going back when chunking step was skipped
        if (activeStep === 2 && files.length === 0) {
            setActiveStep(0)
        } else {
            setActiveStep((prevStep) => prevStep - 1)
        }
    }

    const handleInputChange = (field: keyof TextProcessingConfig, value: string | boolean | number) => {
        setConfig((prev) => ({ ...prev, [field]: value }))
    }

    const handleChunkSizeChange = (value: number) => {
        setConfig((prev) => ({ ...prev, chunk_token_size: value }))
    }

    const handleOverlapChange = (value: number) => {
        setConfig((prev) => ({ ...prev, min_chunk_size_chars: value }))
    }

    const renderStepContent = (step: number) => {
        switch (step) {
            case 0:
                return (
                    <div className="flex flex-col gap-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Input
                                        label="Collection Name"
                                        placeholder="Optional - Enter a name or leave empty for a random name"
                                        value={config.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        className="w-full"
                                        endContent={
                                            <Tooltip content="Leave empty for a randomly generated name">
                                                <Info className="w-4 h-4 text-default-400" />
                                            </Tooltip>
                                        }
                                    />
                                    <Button
                                        isIconOnly
                                        variant="flat"
                                        className="self-end h-14"
                                        onPress={() => handleInputChange('name', generateRandomName())}
                                    >
                                        🎲
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Textarea
                                        label="Description"
                                        placeholder="Optional - Enter a description for your collection"
                                        value={config.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            <Divider className="my-4" />

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">Upload Documents</span>
                                        <Tooltip content="You can upload documents now or add them later">
                                            <Info className="w-4 h-4 text-default-400" />
                                        </Tooltip>
                                    </div>
                                    <Chip variant="flat" color="primary" size="sm" className="capitalize">
                                        Optional
                                    </Chip>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <Button
                                        variant="flat"
                                        color="primary"
                                        className="w-full"
                                        onPress={async () => {
                                            let nameToUse = config.name
                                            if (!config.name.trim()) {
                                                nameToUse = generateRandomName()
                                                setConfig((prev) => ({ ...prev, name: nameToUse }))
                                                setNameAlert(`Using generated name: ${nameToUse}`)
                                            }

                                            try {
                                                setIsSubmitting(true)
                                                console.log('Submitting...')
                                                const requestData: DocumentCollectionCreateRequest = {
                                                    name: nameToUse,
                                                    description: config.description,
                                                    text_processing: {
                                                        chunk_token_size:
                                                            files.length === 0
                                                                ? 1000
                                                                : config.chunkingMode === 'automatic'
                                                                  ? 1000
                                                                  : config.chunk_token_size,
                                                        min_chunk_size_chars:
                                                            files.length === 0
                                                                ? 100
                                                                : config.chunkingMode === 'automatic'
                                                                  ? 100
                                                                  : config.min_chunk_size_chars,
                                                        min_chunk_length_to_embed: 10,
                                                        embeddings_batch_size: 32,
                                                        max_num_chunks: 1000,
                                                        use_vision_model:
                                                            files.length === 0 ? false : config.use_vision_model,
                                                        ...(config.use_vision_model &&
                                                            config.vision_model && {
                                                                vision_model: config.vision_model,
                                                                vision_provider: config.vision_provider,
                                                            }),
                                                    },
                                                }

                                                const response = await createDocumentCollection(
                                                    requestData,
                                                    files.length > 0 ? files : undefined
                                                )
                                                setAlert({
                                                    type: 'success',
                                                    message: 'Document collection created successfully',
                                                })
                                                router.push(`/rag/collections/${response.id}`)
                                            } catch (error) {
                                                console.error('Error creating collection:', error)
                                                setAlert({
                                                    type: 'danger',
                                                    message: 'Error creating document collection',
                                                })
                                            } finally {
                                                setIsSubmitting(false)
                                            }
                                        }}
                                        startContent={<CheckCircle className="w-4 h-4" />}
                                    >
                                        Create Empty Collection
                                    </Button>

                                    <div className="flex items-center gap-2">
                                        <Divider className="flex-1" />
                                        <span className="text-default-400">or</span>
                                        <Divider className="flex-1" />
                                    </div>

                                    <FileUploadBox onFilesChange={handleFilesChange} />
                                </div>
                            </div>
                        </div>
                    </div>
                )

            case 1:
                return (
                    <div className="flex flex-col gap-8">
                        {renderVisionModelSettings()}

                        <Card className="p-6">
                            <div className="space-y-6">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-semibold">Text Processing</h3>
                                    <Tooltip content="Configure how your documents will be processed and split into chunks">
                                        <Info className="w-4 h-4 text-default-400" />
                                    </Tooltip>
                                </div>

                                <RadioGroup
                                    value={config.chunkingMode}
                                    onValueChange={(value) => handleInputChange('chunkingMode', value)}
                                    orientation="horizontal"
                                    classNames={{
                                        wrapper: 'gap-4',
                                    }}
                                >
                                    <Radio
                                        value="automatic"
                                        description="Let the system determine optimal chunk size and overlap"
                                    >
                                        Automatic
                                    </Radio>
                                    <Radio value="manual" description="Manually configure chunk size and overlap">
                                        Manual
                                    </Radio>
                                </RadioGroup>

                                {config.chunkingMode === 'manual' && (
                                    <div className="grid grid-cols-2 gap-6 p-4 bg-default-50 rounded-lg">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">Chunk Size</span>
                                                    <Tooltip content="Number of tokens per chunk. Larger chunks provide more context but may be less precise">
                                                        <Info className="w-4 h-4 text-default-400" />
                                                    </Tooltip>
                                                </div>
                                                <Chip size="sm" variant="flat">
                                                    {config.chunk_token_size} tokens
                                                </Chip>
                                            </div>
                                            <Slider
                                                size="sm"
                                                step={10}
                                                minValue={100}
                                                maxValue={2000}
                                                value={config.chunk_token_size}
                                                onChange={handleChunkSizeChange}
                                                classNames={{
                                                    base: 'max-w-full',
                                                    track: 'bg-default-500/30',
                                                    filler: 'bg-primary',
                                                    thumb: 'transition-all shadow-lg',
                                                }}
                                                marks={[
                                                    { value: 500, label: '500' },
                                                    { value: 1000, label: '1000' },
                                                    { value: 1500, label: '1500' },
                                                ]}
                                                aria-label="Chunk Size"
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">Chunk Overlap</span>
                                                    <Tooltip content="Number of overlapping tokens between chunks to maintain context">
                                                        <Info className="w-4 h-4 text-default-400" />
                                                    </Tooltip>
                                                </div>
                                                <Chip size="sm" variant="flat">
                                                    {config.min_chunk_size_chars} tokens
                                                </Chip>
                                            </div>
                                            <Slider
                                                size="sm"
                                                step={10}
                                                minValue={0}
                                                maxValue={500}
                                                value={config.min_chunk_size_chars}
                                                onChange={handleOverlapChange}
                                                classNames={{
                                                    base: 'max-w-full',
                                                    track: 'bg-default-500/30',
                                                    filler: 'bg-primary',
                                                    thumb: 'transition-all shadow-lg',
                                                }}
                                                marks={[
                                                    { value: 100, label: '100' },
                                                    { value: 200, label: '200' },
                                                    { value: 300, label: '300' },
                                                ]}
                                                aria-label="Chunk Overlap"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                )

            case 2:
                return (
                    <div className="flex flex-col gap-8">
                        <Card className="p-6">
                            <div className="space-y-6">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-semibold">Chunk Templates</h3>
                                    <Tooltip content="Configure how your chunks will be formatted and what metadata to extract">
                                        <Info className="w-4 h-4 text-default-400" />
                                    </Tooltip>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            isSelected={config.template.enabled}
                                            onValueChange={(checked) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    template: {
                                                        ...prev.template,
                                                        enabled: checked,
                                                    },
                                                }))
                                            }
                                            size="sm"
                                        >
                                            Enable Custom Templates
                                        </Switch>
                                        <Tooltip content="Use templates to customize how chunks are formatted and add metadata">
                                            <Info className="w-4 h-4 text-default-400" />
                                        </Tooltip>
                                    </div>

                                    {config.template.enabled && (
                                        <ChunkEditor
                                            template={config.template}
                                            onTemplateChange={(template) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    template: {
                                                        ...template,
                                                        metadata_template: {
                                                            type: 'text_chunk',
                                                            ...template.metadata_template,
                                                        },
                                                    },
                                                }))
                                            }
                                            chunkingConfig={{
                                                chunk_token_size:
                                                    config.chunkingMode === 'automatic'
                                                        ? 1000
                                                        : config.chunk_token_size,
                                                min_chunk_size_chars:
                                                    config.chunkingMode === 'automatic'
                                                        ? 100
                                                        : config.min_chunk_size_chars,
                                                min_chunk_length_to_embed: 10,
                                            }}
                                            files={files}
                                        />
                                    )}
                                </div>
                            </div>
                        </Card>
                    </div>
                )

            case 3:
                return (
                    <Card>
                        <CardBody className="gap-4">
                            <div className="text-lg font-semibold">Review Configuration</div>
                            <div className="space-y-4">
                                <div>
                                    <div className="font-medium">Files to Upload:</div>
                                    {files.map((file) => (
                                        <div key={file.name} className="text-default-500">
                                            {file.name}
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <div className="font-medium">Collection Name:</div>
                                    <div className="text-default-500">{config.name}</div>
                                </div>
                                {config.description && (
                                    <div>
                                        <div className="font-medium">Description:</div>
                                        <div className="text-default-500">{config.description}</div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="font-medium">Chunk Token Size:</div>
                                        <div className="text-default-500">
                                            {config.chunkingMode === 'automatic'
                                                ? 'Automatic'
                                                : `${config.chunk_token_size} tokens`}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-medium">Min Chunk Size:</div>
                                        <div className="text-default-500">
                                            {config.chunkingMode === 'automatic'
                                                ? 'Automatic'
                                                : `${config.min_chunk_size_chars} tokens`}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <div className="font-medium">Vision Model:</div>
                                    <div className="text-default-500">
                                        {config.use_vision_model ? 'Enabled' : 'Disabled'}
                                        {config.use_vision_model && config.vision_model && (
                                            <>
                                                {' '}
                                                ({config.vision_model} via {config.vision_provider})
                                            </>
                                        )}
                                    </div>
                                </div>
                                {config.template.enabled && (
                                    <div>
                                        <div className="font-medium">Chunk Template:</div>
                                        <div className="text-default-500">
                                            <pre className="bg-default-100 p-2 rounded-lg mt-2 text-xs">
                                                {config.template.template}
                                            </pre>
                                            <div className="mt-2">
                                                <span className="font-medium">Metadata Fields: </span>
                                                {Object.keys(config.template.metadata_template).map((key) => (
                                                    <Chip key={key} size="sm" variant="flat" className="ml-2">
                                                        {key}
                                                    </Chip>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardBody>
                    </Card>
                )

            default:
                return null
        }
    }

    const renderVisionModelSettings = () => {
        // Show vision model settings if there are any PDF files
        if (files.some((f) => f.name.toLowerCase().endsWith('.pdf'))) {
            return (
                <Card className="p-6">
                    <div className="space-y-6">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">PDF Processing</h3>
                            <Tooltip content="PDFs will be processed using AI vision models for better text extraction">
                                <Info className="w-4 h-4 text-default-400" />
                            </Tooltip>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Switch
                                    isSelected={config.use_vision_model}
                                    onValueChange={(checked) =>
                                        setConfig((prev) => ({ ...prev, use_vision_model: checked }))
                                    }
                                    size="sm"
                                >
                                    Use AI Vision for Enhanced PDF Processing
                                </Switch>
                                <Tooltip content="AI vision models provide superior text extraction from PDFs, especially for complex layouts, tables, and images with text">
                                    <Info className="w-4 h-4 text-default-400" />
                                </Tooltip>
                            </div>

                            {config.use_vision_model && (
                                <div className="space-y-4">
                                    <div className="p-4 bg-primary-100/10 dark:bg-slate-800/80 border border-primary-200/20 dark:border-blue-500/20 rounded-lg">
                                        <div className="text-sm">
                                            <p className="flex items-center gap-2 mb-3">
                                                <span className="text-primary-500 dark:text-blue-400">✨</span>
                                                <span className="font-medium text-default-800 dark:text-white">Using AI vision models for enhanced PDF processing:</span>
                                            </p>
                                            <ul className="list-none space-y-2.5 ml-1">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-primary-500 dark:text-blue-400 mt-1">•</span>
                                                    <span className="text-default-600 dark:text-blue-200">Better handling of complex layouts</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-primary-500 dark:text-blue-400 mt-1">•</span>
                                                    <span className="text-default-600 dark:text-blue-200">Improved table and image text extraction</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-primary-500 dark:text-blue-400 mt-1">•</span>
                                                    <span className="text-default-600 dark:text-blue-200">More accurate preservation of document structure</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                    <Select
                                        label="Vision Model"
                                        placeholder="Select vision model"
                                        selectedKeys={
                                            config.vision_model
                                                ? [`${config.vision_model}|${config.vision_provider}`]
                                                : []
                                        }
                                        defaultSelectedKeys={['gpt-4o-mini|openai']}
                                        onSelectionChange={(keys) => {
                                            const value = Array.from(keys)[0]?.toString() || ''
                                            const [model, provider] = value.split('|')
                                            setConfig((prev) => ({
                                                ...prev,
                                                vision_model: model,
                                                vision_provider: provider,
                                            }))
                                        }}
                                    >
                                        <SelectItem key="gpt-4o-mini|openai">GPT-4 Optimized (OpenAI)</SelectItem>
                                        <SelectItem key="gpt-4-vision|openai">GPT-4 Vision (OpenAI)</SelectItem>
                                        <SelectItem key="claude-3|anthropic">Claude 3 (Anthropic)</SelectItem>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )
        }
        return null
    }

    return (
        <div className="max-w-[1200px] mx-auto p-6 min-h-screen bg-gradient-to-b from-background to-default-50/50">
            <div className="flex flex-col md:flex-row gap-8">
                {/* Left side - Steps */}
                <div className="w-full md:w-1/3 lg:w-1/4">
                    <motion.div
                        className="sticky top-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex flex-col max-w-fit mb-2">
                            <h1 className="text-3xl font-bold text-default-900">Create Document Collection</h1>
                            <p className="text-small text-default-400">
                                Follow the steps to configure your document collection settings.
                            </p>
                        </div>
                        <Progress
                            classNames={{
                                base: 'mb-4',
                                track: 'drop-shadow-md',
                                indicator: 'bg-gradient-to-r from-primary to-primary-500',
                                label: 'text-sm font-medium',
                                value: 'text-sm font-medium text-default-500',
                            }}
                            label="Progress"
                            size="md"
                            value={(activeStep / (steps.length - 1)) * 100}
                            showValueLabel={true}
                            valueLabel={`${activeStep + 1} of ${steps.length}`}
                        />

                        <AnimatePresence>
                            {nameAlert && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Alert className="mb-4" color="primary" startContent={<Info className="h-4 w-4" />}>
                                        {nameAlert}
                                    </Alert>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {alert && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Alert
                                        className="mb-4"
                                        color={alert.type}
                                        startContent={
                                            alert.type === 'success' ? (
                                                <CheckCircle className="h-4 w-4" />
                                            ) : (
                                                <Info className="h-4 w-4" />
                                            )
                                        }
                                    >
                                        {alert.message}
                                    </Alert>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex flex-col gap-4">
                            {steps.map((step, index) => (
                                <motion.button
                                    key={index}
                                    onClick={() => setActiveStep(index)}
                                    className={`flex flex-col gap-1 rounded-xl border-1 p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg
                    ${
                        activeStep === index
                            ? 'border-primary bg-primary/5 shadow-md'
                            : index < activeStep
                              ? 'border-success/50 bg-success/5'
                              : 'border-default-200 dark:border-default-100'
                    }
                    ${index === 1 && files.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    disabled={index > activeStep || (index === 1 && files.length === 0)}
                                    whileHover={{
                                        scale: index <= activeStep && !(index === 1 && files.length === 0) ? 1.02 : 1,
                                    }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors duration-300
                        ${
                            activeStep === index
                                ? 'bg-primary text-white shadow-md'
                                : index < activeStep
                                  ? 'bg-success text-white'
                                  : 'bg-default-100 text-default-600'
                        }`}
                                        >
                                            {index < activeStep ? '✓' : index + 1}
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="font-semibold text-default-900">{step}</span>
                                            {index === 0 && (
                                                <span className="text-xs text-default-400">
                                                    Upload your documents or create an empty collection
                                                </span>
                                            )}
                                            {index === 1 && (
                                                <span className="text-xs text-default-400">
                                                    Configure text processing settings
                                                </span>
                                            )}
                                            {index === 2 && (
                                                <span className="text-xs text-default-400">Configure templates</span>
                                            )}
                                            {index === 3 && (
                                                <span className="text-xs text-default-400">
                                                    Review and create your collection
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Right side - Content */}
                <motion.div
                    className="flex-1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    <Card className="bg-background/60 dark:bg-background/60 backdrop-blur-lg backdrop-saturate-150 shadow-xl border-1 border-default-200">
                        <CardBody className="gap-8 p-8">
                            {renderStepContent(activeStep)}

                            <Divider className="my-4" />

                            <div className="flex justify-between items-center">
                                <Button
                                    color="danger"
                                    variant="light"
                                    onPress={() => router.back()}
                                    className="font-medium hover:bg-danger/10"
                                >
                                    Cancel
                                </Button>
                                <div className="flex gap-3">
                                    {activeStep > 0 && (
                                        <Button
                                            variant="bordered"
                                            onPress={handleBack}
                                            className="font-medium"
                                            startContent={<ArrowLeft size={18} />}
                                            isDisabled={isSubmitting}
                                        >
                                            Back
                                        </Button>
                                    )}
                                    <Button
                                        color="primary"
                                        onPress={activeStep === steps.length - 1 ? handleSubmit : handleNext}
                                        className="font-medium"
                                        endContent={activeStep !== steps.length - 1 && <ArrowRight size={18} />}
                                        isLoading={isSubmitting}
                                        isDisabled={
                                            (activeStep === 1 && !config.name) ||
                                            (activeStep === steps.length - 1 && isSubmitting)
                                        }
                                    >
                                        {activeStep === steps.length - 1 ? 'Create Collection' : 'Next'}
                                    </Button>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </motion.div>
            </div>
        </div>
    )
}
