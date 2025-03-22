import {
    Alert,
    Button,
    Card,
    CardBody,
    Chip,
    Divider,
    Input,
    Progress,
    Radio,
    RadioGroup,
    Select,
    SelectItem,
    Slider,
    Switch,
    Textarea,
    Tooltip,
    Accordion,
    AccordionItem,
} from '@heroui/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle, Info } from 'lucide-react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

import type { DocumentCollectionCreateRequest } from '@/utils/api'
import { createDocumentCollection } from '@/utils/api'

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
    const [files, setFiles] = useState<File[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [alert, setAlert] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)
    const [nameAlert, setNameAlert] = useState<string | null>(null)
    const [config, setConfig] = useState<TextProcessingConfig>({
        name: '',
        description: '',
        chunk_token_size: 1000,
        min_chunk_size_chars: 100,
        use_vision_model: false,
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
            // Generate a random name if none provided
            if (!config.name.trim()) {
                const randomName = generateRandomName()
                setConfig((prev) => ({ ...prev, name: randomName }))
                setNameAlert(`Using generated name: ${randomName}`)
            }

            setIsSubmitting(true)
            console.log('Submitting...')
            console.log(config)
            const requestData: DocumentCollectionCreateRequest = {
                name: config.name || generateRandomName(),
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

    const handleInputChange = (field: keyof TextProcessingConfig, value: string | boolean | number) => {
        setConfig((prev) => ({ ...prev, [field]: value }))
    }

    const handleChunkSizeChange = (value: number) => {
        setConfig((prev) => ({ ...prev, chunk_token_size: value }))
    }

    const handleOverlapChange = (value: number) => {
        setConfig((prev) => ({ ...prev, min_chunk_size_chars: value }))
    }

    const renderVisionModelSettings = () => {
        // Show vision model settings if there are any PDF files
        if (files.some((f) => f.name.toLowerCase().endsWith('.pdf'))) {
            return (
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <h3 className="text-md font-semibold">PDF Processing</h3>
                        <Tooltip content="Configure how PDF documents will be processed">
                            <Info className="w-4 h-4 text-default-400" />
                        </Tooltip>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Switch
                                isDisabled
                                isSelected={config.use_vision_model}
                                onValueChange={(checked) =>
                                    setConfig((prev) => ({ ...prev, use_vision_model: checked }))
                                }
                                size="sm"
                            >
                                Enable Vision Model for PDF Processing (Coming Soon)
                            </Switch>
                            <Tooltip content="Use AI vision models to better understand document layout and extract text. This feature is coming soon!">
                                <Info className="w-4 h-4 text-default-400" />
                            </Tooltip>
                        </div>

                        {config.use_vision_model && (
                            <div className="space-y-4">
                                <Select
                                    label="Vision Model"
                                    placeholder="Select vision model"
                                    selectedKeys={
                                        config.vision_model
                                            ? [`${config.vision_model}|${config.vision_provider}`]
                                            : []
                                    }
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
                                    <SelectItem key="gpt-4-vision|openai">GPT-4 Vision (OpenAI)</SelectItem>
                                    <SelectItem key="claude-3|anthropic">Claude 3 (Anthropic)</SelectItem>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>
            )
        }
        return null
    }

    return (
        <div className="max-w-[900px] mx-auto p-6">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-default-900">Create Document Collection</h1>
                        <p className="text-sm text-default-500">Create a new document collection for your knowledge base</p>
                    </div>
                </div>

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

                <Card className="mb-6 border border-default-200">
                    <CardBody>
                        <Accordion defaultExpandedKeys={["1"]}>
                            {/* Basic Information */}
                            <AccordionItem
                                key="1"
                                aria-label="Basic Information"
                                title={
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">1</span>
                                        <span className="text-md font-semibold">Basic Information</span>
                                    </div>
                                }
                                subtitle="Set name and upload documents"
                            >
                                <div className="space-y-4 pt-2">
                                    <div className="grid grid-cols-1 gap-4">
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

                                        <Textarea
                                            label="Description"
                                            placeholder="Optional - Enter a description for your collection"
                                            value={config.description}
                                            onChange={(e) => handleInputChange('description', e.target.value)}
                                            className="w-full"
                                        />

                                        <Divider className="my-2" />

                                        <div className="space-y-2">
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

                                            <div className="mt-2">
                                                <Button
                                                    variant="flat"
                                                    color="primary"
                                                    className="w-full mb-4"
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

                                                <div className="flex items-center gap-2 mb-4">
                                                    <Divider className="flex-1" />
                                                    <span className="text-default-400">or upload documents</span>
                                                    <Divider className="flex-1" />
                                                </div>

                                                <FileUploadBox onFilesChange={handleFilesChange} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </AccordionItem>

                            {/* Processing Settings */}
                            <AccordionItem
                                key="2"
                                aria-label="Processing Settings"
                                title={
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">2</span>
                                        <span className="text-md font-semibold">Processing Settings</span>
                                    </div>
                                }
                                subtitle="Configure chunking and text processing"
                                isDisabled={files.length === 0}
                            >
                                <div className="space-y-4 pt-2">
                                    {files.length === 0 ? (
                                        <Alert color="primary">
                                            Please upload documents to configure processing settings
                                        </Alert>
                                    ) : (
                                        <>
                                            {renderVisionModelSettings()}

                                            <div className="space-y-6 p-4 bg-default-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-md font-semibold">Text Processing</h3>
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
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-default-100 rounded-lg">
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
                                        </>
                                    )}
                                </div>
                            </AccordionItem>

                            {/* Template Configuration */}
                            <AccordionItem
                                key="3"
                                aria-label="Template Configuration"
                                title={
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">3</span>
                                        <span className="text-md font-semibold">Template Configuration</span>
                                    </div>
                                }
                                subtitle="Configure custom templates for chunks"
                                isDisabled={files.length === 0}
                            >
                                <div className="space-y-4 pt-2">
                                    {files.length === 0 ? (
                                        <Alert color="primary">
                                            Please upload documents to configure templates
                                        </Alert>
                                    ) : (
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
                                    )}
                                </div>
                            </AccordionItem>

                            {/* Review Configuration */}
                            <AccordionItem
                                key="4"
                                aria-label="Review Configuration"
                                title={
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">4</span>
                                        <span className="text-md font-semibold">Review Configuration</span>
                                    </div>
                                }
                                subtitle="Review and create collection"
                            >
                                <div className="space-y-4 pt-2">
                                    <div className="bg-default-50 p-4 rounded-lg">
                                        <div className="space-y-4">
                                            <div>
                                                <div className="font-medium">Files to Upload:</div>
                                                {files.length > 0 ? (
                                                    <div className="mt-2 max-h-[100px] overflow-y-auto">
                                                        {files.map((file) => (
                                                            <div key={file.name} className="text-default-500 flex items-center gap-2">
                                                                <div className="w-3 h-3 rounded-full bg-primary"></div>
                                                                {file.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-default-500">No files selected (Empty collection)</div>
                                                )}
                                            </div>

                                            <Divider className="my-2" />

                                            <div>
                                                <div className="font-medium">Collection Name:</div>
                                                <div className="text-default-500">{config.name || 'Will be generated automatically'}</div>
                                            </div>

                                            {config.description && (
                                                <div>
                                                    <div className="font-medium">Description:</div>
                                                    <div className="text-default-500">{config.description}</div>
                                                </div>
                                            )}

                                            {files.length > 0 && (
                                                <>
                                                    <Divider className="my-2" />

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                        <div className="mt-4">
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
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </AccordionItem>
                        </Accordion>
                    </CardBody>
                </Card>

                <div className="flex justify-between items-center">
                    <Button
                        color="danger"
                        variant="light"
                        onPress={() => router.back()}
                        className="font-medium hover:bg-danger/10"
                    >
                        Cancel
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleSubmit}
                        className="font-medium"
                        isLoading={isSubmitting}
                        isDisabled={isSubmitting}
                    >
                        Create Collection
                    </Button>
                </div>
            </motion.div>
        </div>
    )
}
