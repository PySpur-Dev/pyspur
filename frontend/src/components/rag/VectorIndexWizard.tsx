import {
    Alert,
    Button,
    Card,
    CardBody,
    Divider,
    Input,
    Progress,
    Select,
    SelectItem,
    SelectSection,
    Textarea,
    Tooltip,
    Accordion,
    AccordionItem,
    Chip,
} from '@heroui/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle, Info } from 'lucide-react'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import type {
    DocumentCollectionResponseSchema,
    VectorIndexCreateRequestSchema as VectorIndexCreateRequest,
} from '@/types/api_types/ragSchemas'
import type { EmbeddingModelConfig, VectorStoreConfig } from '@/utils/api'
import {
    createVectorIndex,
    getApiKey,
    getEmbeddingModels,
    getVectorStores,
    listApiKeys,
    listDocumentCollections,
} from '@/utils/api'

interface EmbeddingConfig {
    name: string
    description: string
    collection_id: string
    embedding_model: string
    vector_db: string
    search_strategy: string
}

const steps = [
    {
        title: 'Select Collection',
        description: 'Choose a document collection to create an index from',
        isCompleted: false,
    },
    {
        title: 'Configure Embeddings',
        description: 'Configure embedding model and vector store settings',
        isCompleted: false,
    },
    {
        title: 'Create Index',
        description: 'Review and create your vector index',
        isCompleted: false,
    },
]

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

export const VectorIndexWizard: React.FC = () => {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [collections, setCollections] = useState<DocumentCollectionResponseSchema[]>([])
    const [embeddingModels, setEmbeddingModels] = useState<Record<string, EmbeddingModelConfig>>({})
    const [vectorStores, setVectorStores] = useState<Record<string, VectorStoreConfig>>({})
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
    const [isLoadingModels, setIsLoadingModels] = useState(true)
    const [isLoadingStores, setIsLoadingStores] = useState(true)
    const [alert, setAlert] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)
    const [config, setConfig] = useState<EmbeddingConfig>({
        name: '',
        description: '',
        collection_id: '',
        embedding_model: '',
        vector_db: '',
        search_strategy: 'vector',
    })
    const [nameAlert, setNameAlert] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                const [modelsData, storesData] = await Promise.all([getEmbeddingModels(), getVectorStores()])
                setEmbeddingModels(modelsData)
                setVectorStores(storesData)
            } catch (error) {
                console.error('Error loading data:', error)
            } finally {
                setIsLoadingModels(false)
                setIsLoadingStores(false)
            }
        }

        const loadApiKeys = async () => {
            try {
                const keys = await listApiKeys()
                const keyValues: Record<string, string> = {}
                for (const key of keys) {
                    const keyData = await getApiKey(key)
                    if (keyData.value) {
                        keyValues[key] = keyData.value
                    }
                }
                setApiKeys(keyValues)
            } catch (error) {
                console.error('Error loading API keys:', error)
            }
        }

        loadData()
        loadApiKeys()
    }, [])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [collectionsData, modelsData, storesData] = await Promise.all([
                    listDocumentCollections(),
                    getEmbeddingModels(),
                    getVectorStores(),
                ])
                setCollections(collectionsData)
                setEmbeddingModels(modelsData)
                setVectorStores(storesData)
            } catch (error) {
                console.error('Error fetching data:', error)
                setAlert({ type: 'danger', message: 'Error loading configuration options' })
            }
        }
        fetchData()
    }, [])

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

    const handleSubmit = async () => {
        try {
            // Basic validation
            if (!config.collection_id) {
                setAlert({ type: 'danger', message: 'Please select a document collection' })
                return
            }

            if (!config.embedding_model) {
                setAlert({ type: 'danger', message: 'Please select an embedding model' })
                return
            }

            if (!config.vector_db) {
                setAlert({ type: 'danger', message: 'Please select a vector database' })
                return
            }

            // Use a random name if none provided
            if (!config.name.trim()) {
                const randomName = generateRandomName()
                setConfig((prev) => ({ ...prev, name: randomName }))
                setNameAlert(`Using generated name: ${randomName}`)
            }

            setIsSubmitting(true)
            const createRequest: VectorIndexCreateRequest = {
                name: config.name || generateRandomName(),
                description: config.description,
                collection_id: config.collection_id,
                embedding: {
                    model: config.embedding_model,
                    vector_db: config.vector_db,
                    search_strategy: config.search_strategy,
                    semantic_weight: 1.0,
                    keyword_weight: 0.0,
                    top_k: 3,
                    score_threshold: 0.7,
                },
            }
            const index = await createVectorIndex(createRequest)
            setAlert({ type: 'success', message: 'Vector index created successfully' })
            router.push(`/rag/indices/${index.id}`)
        } catch (error) {
            console.error('Error creating index:', error)
            setAlert({ type: 'danger', message: 'Error creating vector index' })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleConfigChange =
        (field: keyof EmbeddingConfig) => (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
            const value = event.target.value
            setConfig((prev) => ({ ...prev, [field]: value }))
        }

    const ApiKeyWarning = ({
        modelInfo,
        storeInfo,
    }: {
        modelInfo?: EmbeddingModelConfig
        storeInfo?: VectorStoreConfig
    }) => {
        let missingParams: string[] = []
        let serviceName = ''

        if (modelInfo) {
            modelInfo.required_env_vars.forEach((envVar) => {
                if (!apiKeys[envVar] || apiKeys[envVar] === '') {
                    missingParams.push(envVar)
                }
            })
            serviceName = modelInfo.name
        } else if (storeInfo) {
            storeInfo.required_env_vars.forEach((envVar) => {
                if (!apiKeys[envVar] || apiKeys[envVar] === '') {
                    missingParams.push(envVar)
                }
            })
            serviceName = storeInfo.name
        } else {
            return null
        }

        if (missingParams.length > 0) {
            return (
                <Alert className="mt-2" color="warning" title={`Missing Configuration for ${serviceName}`}>
                    {missingParams.length === 1
                        ? `Please set the ${missingParams[0]} in Settings > API Keys before using this service.`
                        : `Please set the following in Settings > API Keys before using this service: ${missingParams.join(', ')}`}
                </Alert>
            )
        }

        return null
    }

    const renderEmbeddingSection = () => (
        <div className="space-y-2">
            <Select
                placeholder="Select embedding model"
                selectedKeys={[config.embedding_model]}
                onChange={(e) => handleConfigChange('embedding_model')(e as any)}
                isLoading={isLoadingModels}
                classNames={{
                    trigger: 'h-12',
                }}
            >
                {(() => {
                    const groupedModels = Object.entries(embeddingModels).reduce(
                        (groups, [modelId, modelInfo]) => {
                            const provider = modelInfo.provider || 'Other'
                            if (!groups[provider]) {
                                groups[provider] = []
                            }
                            groups[provider].push({ ...modelInfo, id: modelId })
                            return groups
                        },
                        {} as Record<string, (EmbeddingModelConfig & { id: string })[]>
                    )

                    return Object.entries(groupedModels).map(([provider, models], index, entries) => (
                        <SelectSection key={provider} title={provider} showDivider={index < entries.length - 1}>
                            {models.map((model) => (
                                <SelectItem key={model.id} value={model.id} textValue={model.name}>
                                    <div className="flex flex-col">
                                        <span>{model.name}</span>
                                        <span className="text-tiny text-default-400">
                                            {model.dimensions} dimensions
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectSection>
                    ))
                })()}
            </Select>
            {config.embedding_model && <ApiKeyWarning modelInfo={embeddingModels[config.embedding_model]} />}
        </div>
    )

    const renderVectorStoreSection = () => (
        <div className="space-y-2">
            <Select
                placeholder="Select vector database"
                selectedKeys={[config.vector_db]}
                onChange={(e) => handleConfigChange('vector_db')(e as any)}
                isLoading={isLoadingStores}
                classNames={{
                    trigger: 'h-12',
                }}
            >
                {Object.entries(vectorStores).map(([storeId, store]) => (
                    <SelectItem key={storeId} value={storeId} textValue={store.name}>
                        <div className="flex flex-col">
                            <span>{store.name}</span>
                            <span className="text-tiny text-default-400">{store.description}</span>
                        </div>
                    </SelectItem>
                ))}
            </Select>
            {config.vector_db && <ApiKeyWarning storeInfo={vectorStores[config.vector_db]} />}
        </div>
    )

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
                        <h1 className="text-2xl font-bold text-default-900">Create Vector Index</h1>
                        <p className="text-sm text-default-500">Create a searchable vector index from your document collection</p>
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
                            {/* Basic Information Section */}
                            <AccordionItem
                                key="1"
                                aria-label="Basic Information"
                                title={
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">1</span>
                                        <span className="text-md font-semibold">Basic Information</span>
                                    </div>
                                }
                                subtitle="Select collection and set index details"
                            >
                                <div className="space-y-4 pt-2">
                                    <div className="grid grid-cols-1 gap-4">
                                        <Select
                                            label="Document Collection"
                                            placeholder="Select a document collection"
                                            selectedKeys={config.collection_id ? [config.collection_id] : []}
                                            onChange={(e) => handleConfigChange('collection_id')(e as any)}
                                            isRequired
                                        >
                                            {collections.map((collection) => (
                                                <SelectItem key={collection.id} value={collection.id}>
                                                    {collection.name}
                                                </SelectItem>
                                            ))}
                                        </Select>

                                        <div className="flex gap-2">
                                            <Input
                                                label="Index Name"
                                                placeholder="Optional - Enter a name or leave empty for a random name"
                                                value={config.name}
                                                onChange={handleConfigChange('name')}
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
                                                onPress={() =>
                                                    handleConfigChange('name')({ target: { value: generateRandomName() } } as any)
                                                }
                                            >
                                                🎲
                                            </Button>
                                        </div>

                                        <Textarea
                                            label="Description"
                                            value={config.description}
                                            onChange={handleConfigChange('description')}
                                            minRows={3}
                                            placeholder="Optional description of this vector index"
                                            endContent={
                                                <Tooltip content="Optional description of your vector index">
                                                    <Info className="w-4 h-4 text-default-400" />
                                                </Tooltip>
                                            }
                                        />
                                    </div>
                                </div>
                            </AccordionItem>

                            {/* Embedding Configuration */}
                            <AccordionItem
                                key="2"
                                aria-label="Embedding Configuration"
                                title={
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">2</span>
                                        <span className="text-md font-semibold">Embedding Configuration</span>
                                    </div>
                                }
                                subtitle="Configure embedding model and vector database"
                            >
                                <div className="space-y-4 pt-2">
                                    <div className="grid grid-cols-1 gap-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-sm font-medium">Embedding Model</span>
                                                <Tooltip content="Configure how your text will be converted to vector embeddings">
                                                    <Info className="w-4 h-4 text-default-400" />
                                                </Tooltip>
                                            </div>
                                            {renderEmbeddingSection()}
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-sm font-medium">Vector Database</span>
                                                <Tooltip content="Choose where your vector embeddings will be stored">
                                                    <Info className="w-4 h-4 text-default-400" />
                                                </Tooltip>
                                            </div>
                                            {renderVectorStoreSection()}
                                        </div>
                                    </div>
                                </div>
                            </AccordionItem>

                            {/* Review Configuration */}
                            <AccordionItem
                                key="3"
                                aria-label="Review Configuration"
                                title={
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">3</span>
                                        <span className="text-md font-semibold">Review Configuration</span>
                                    </div>
                                }
                                subtitle="Review your index configuration before creating"
                            >
                                <div className="space-y-4 pt-2">
                                    <div className="bg-default-50 p-4 rounded-lg">
                                        <div className="space-y-4">
                                            <div>
                                                <div className="font-medium">Collection:</div>
                                                <div className="text-default-500">
                                                    {collections.find(c => c.id === config.collection_id)?.name || 'No collection selected'}
                                                    {config.collection_id && (
                                                        <Chip size="sm" variant="flat" color="primary" className="ml-2">
                                                            {config.collection_id}
                                                        </Chip>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="font-medium">Index Name:</div>
                                                <div className="text-default-500">{config.name || 'Will be generated automatically'}</div>
                                            </div>
                                            {config.description && (
                                                <div>
                                                    <div className="font-medium">Description:</div>
                                                    <div className="text-default-500">{config.description}</div>
                                                </div>
                                            )}
                                            <Divider className="my-2" />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <div className="font-medium">Embedding Model:</div>
                                                    <div className="text-default-500">
                                                        {embeddingModels[config.embedding_model]?.name || 'Not selected'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="font-medium">Vector Database:</div>
                                                    <div className="text-default-500">
                                                        {vectorStores[config.vector_db]?.name || 'Not selected'}
                                                    </div>
                                                </div>
                                            </div>
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
                        Create Index
                    </Button>
                </div>
            </motion.div>
        </div>
    )
}
