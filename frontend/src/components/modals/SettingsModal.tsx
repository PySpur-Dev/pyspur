import type { CardProps, SwitchProps } from '@heroui/react'
import {
    Accordion,
    AccordionItem,
    Button,
    Card,
    CardBody,
    CardFooter,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalHeader,
    Switch,
    cn,
    extendVariants,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { useTheme } from 'next-themes'
import React, { useEffect, useState } from 'react'

import { deleteApiKey, getApiKey, listApiKeys, setApiKey } from '@/utils/api'

// CellWrapper Component
const CellWrapper = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('flex items-center justify-between gap-2 rounded-medium bg-content2 p-4', className)}
            {...props}
        >
            {children}
        </div>
    )
)

CellWrapper.displayName = 'CellWrapper'

// CustomSwitch Component
const CustomSwitch = extendVariants(Switch, {
    variants: {
        color: {
            foreground: {
                wrapper: ['group-data-[selected=true]:bg-foreground', 'group-data-[selected=true]:text-background'],
            },
        },
    },
})

// SwitchCell Component
type SwitchCellProps = Omit<SwitchProps, 'color'> & {
    label: string
    description: string
    color?: SwitchProps['color'] | 'foreground'
    classNames?: SwitchProps['classNames'] & {
        description?: string | string[]
    }
}

const SwitchCell = React.forwardRef<HTMLDivElement, SwitchCellProps>(
    ({ label, description, classNames, ...props }, ref) => (
        <div ref={ref}>
            <CustomSwitch
                classNames={{
                    ...classNames,
                    base: cn(
                        'inline-flex bg-content2 flex-row-reverse w-full max-w-full items-center',
                        'justify-between cursor-pointer rounded-medium gap-2 p-4',
                        classNames?.base
                    ),
                }}
                {...props}
            >
                <div className="flex flex-col">
                    <p className={cn('text-medium', classNames?.label)}>{label}</p>
                    <p className={cn('text-small text-default-500', classNames?.description)}>{description}</p>
                </div>
            </CustomSwitch>
        </div>
    )
)

SwitchCell.displayName = 'SwitchCell'

// Provider Types
interface ProviderParameter {
    name: string
    description: string
    required: boolean
    type: string
}

interface ProviderConfig {
    id: string
    name: string
    description: string
    category: string
    parameters: ProviderParameter[]
    icon: string
}

// APIKeys Component
const APIKeys = (props: CardProps): React.ReactElement => {
    const [keys, setKeys] = useState<{ name: string; value: string }[]>([])
    const [originalKeys, setOriginalKeys] = useState<{ name: string; value: string }[]>([])
    const [providers, setProviders] = useState<ProviderConfig[]>([])
    const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null)

    const fetchProviders = async () => {
        try {
            const response = await fetch('/api/env-mgmt/providers')
            const data = await response.json()
            if (Array.isArray(data)) {
                setProviders(data)
            } else {
                console.error('Expected providers data to be an array')
                setProviders([])
            }
        } catch (error) {
            console.error('Error fetching providers:', error)
            setProviders([])
        }
    }

    const fetchApiKeys = async () => {
        try {
            const response = await listApiKeys()
            const keyValues = await Promise.all(
                response.map(async (key: string) => {
                    const value = await getApiKey(key)
                    return { name: value.name, value: value.value }
                })
            )

            setKeys(keyValues)
            setOriginalKeys(keyValues)
        } catch (error) {
            console.error('Error fetching API keys:', error)
        }
    }

    useEffect(() => {
        fetchProviders()
        fetchApiKeys()
    }, [])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setKeys((prevKeys) => prevKeys.map((key) => (key.name === name ? { ...key, value: value } : key)))
    }

    const handleDeleteKey = async (name: string) => {
        try {
            await deleteApiKey(name)
            await fetchApiKeys()
        } catch (error) {
            console.error('Error deleting API key:', error)
        }
    }

    const saveApiKeys = async () => {
        try {
            await Promise.all(
                keys.map(async ({ name, value }) => {
                    const originalKey = originalKeys.find((k) => k.name === name)
                    const trimmedValue = value.trim()

                    if (originalKey && trimmedValue !== originalKey.value) {
                        if (trimmedValue !== '') {
                            await setApiKey(name, trimmedValue)
                        } else {
                            await handleDeleteKey(name)
                        }
                    }
                })
            )
            await fetchApiKeys()
        } catch (error) {
            console.error('Error saving API keys:', error)
        }
    }

    const hasChanges = () => {
        return keys.some((key) => {
            const originalKey = originalKeys.find((k) => k.name === key.name)
            return originalKey && key.value.trim() !== originalKey.value
        })
    }

    const getProviderIcon = (iconName: string) => {
        const iconMap: Record<string, string> = {
            // LLM Providers
            openai: 'logos:openai-icon',
            azure: 'logos:microsoft-azure',
            anthropic: 'logos:anthropic',
            google: 'logos:google-icon',
            deepseek: 'solar:code-circle-bold',
            cohere: 'solar:magic-stick-3-bold',
            voyage: 'solar:rocket-bold',
            mistral: 'solar:stars-bold',

            // Vector Store Providers
            pinecone: 'logos:pinecone',
            weaviate: 'logos:weaviate',
            qdrant: 'logos:qdrant',
            chroma: 'solar:database-minimalistic-bold',
            supabase: 'logos:supabase-icon',
            database: 'solar:database-bold',

            // Other Integrations
            'solar:spider-bold': 'solar:spider-bold', // For Firecrawl
            'logos:slack-icon': 'logos:slack-icon', // For Slack
        }
        return iconMap[iconName] || iconMap.database
    }

    const renderProviderGrid = () => {
        const vectorStoreProviders = providers.filter((p) => p.category === 'vectorstore')
        const llmProviders = providers.filter((p) => p.category === 'llm')
        const otherProviders = providers.filter((p) => !['vectorstore', 'llm'].includes(p.category))

        const renderProviderInputs = (provider: ProviderConfig) => {
            return (
                <div className="space-y-3 py-2">
                    {provider.parameters.map((param) => {
                        const key = keys.find((k) => k.name === param.name)
                        return (
                            <Input
                                key={param.name}
                                label={param.description}
                                placeholder={`Enter ${param.description.toLowerCase()}`}
                                name={param.name}
                                value={key?.value || ''}
                                type={param.type === 'password' ? 'password' : 'text'}
                                size="sm"
                                variant="bordered"
                                isClearable
                                onClear={() => handleDeleteKey(param.name)}
                                onFocus={() =>
                                    setKeys((prevKeys) =>
                                        prevKeys.map((key) => (key.name === param.name ? { ...key, value: '' } : key))
                                    )
                                }
                                onChange={handleInputChange}
                            />
                        )
                    })}
                </div>
            )
        }

        const renderProviderSection = (
            title: string,
            description: string,
            icon: string,
            providerList: ProviderConfig[]
        ) => {
            if (providerList.length === 0) return null

            return (
                <Accordion>
                    <AccordionItem
                        key={title}
                        aria-label={title}
                        title={
                            <div className="flex items-center gap-2">
                                <Icon icon={icon} className="text-primary" width={20} />
                                <div>
                                    <h4 className="text-medium font-medium">{title}</h4>
                                    <p className="text-tiny text-default-400">{description}</p>
                                </div>
                            </div>
                        }
                    >
                        <div className="space-y-6 px-2">
                            {providerList.map((provider) => (
                                <Card key={provider.id} className="border border-default-200">
                                    <CardBody className="gap-4">
                                        <div className="flex items-center gap-2">
                                            <Icon icon={getProviderIcon(provider.icon)} width={24} />
                                            <div>
                                                <h5 className="text-small font-medium">{provider.name}</h5>
                                                <p className="text-tiny text-default-400">{provider.description}</p>
                                            </div>
                                        </div>
                                        {renderProviderInputs(provider)}
                                    </CardBody>
                                </Card>
                            ))}
                        </div>
                    </AccordionItem>
                </Accordion>
            )
        }

        return (
            <div className="space-y-4">
                {renderProviderSection(
                    'AI Models',
                    'Configure your AI model providers',
                    'solar:brain-bold',
                    llmProviders
                )}
                {renderProviderSection(
                    'Vector Databases',
                    'Configure your vector database providers',
                    'solar:database-bold',
                    vectorStoreProviders
                )}
                {renderProviderSection(
                    'Other Integrations',
                    'Configure additional service providers',
                    'solar:widget-bold',
                    otherProviders
                )}
            </div>
        )
    }

    return (
        <Card {...props}>
            <CardBody className="gap-4 p-0">{renderProviderGrid()}</CardBody>
            {hasChanges() && (
                <CardFooter className="px-0 pt-4">
                    <div className="flex gap-2 ml-auto">
                        <Button
                            size="lg"
                            variant="light"
                            onPress={() => {
                                setKeys(originalKeys)
                                setSelectedProvider(null)
                            }}
                            startContent={<Icon icon="solar:close-circle-bold" width={20} />}
                            endContent={<span className="text-xs opacity-70">ESC</span>}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="lg"
                            color="primary"
                            onPress={saveApiKeys}
                            startContent={<Icon icon="solar:disk-bold" width={20} />}
                            endContent={<span className="text-xs opacity-70">⌘+↵</span>}
                        >
                            Save Changes
                        </Button>
                    </div>
                </CardFooter>
            )}
        </Card>
    )
}

interface SettingsModalProps {
    isOpen: boolean
    onOpenChange: (isOpen: boolean) => void
    initialTab?: 'appearance' | 'api-keys'
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onOpenChange, initialTab = 'appearance' }) => {
    const [activeTab, setActiveTab] = React.useState<'appearance' | 'api-keys'>(initialTab)
    const { theme, setTheme } = useTheme()

    // Update activeTab when initialTab prop changes
    React.useEffect(() => {
        if (isOpen && initialTab) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onOpenChange(false)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onOpenChange])

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="full" scrollBehavior="inside">
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader>Settings</ModalHeader>
                        <ModalBody>
                            <div className="flex items-center gap-4 px-4">
                                <button
                                    className={`px-3 py-2 ${
                                        activeTab === 'appearance' ? 'font-semibold text-primary' : ''
                                    }`}
                                    onClick={() => setActiveTab('appearance')}
                                >
                                    <Icon icon="solar:palette-bold" width={20} /> Appearance
                                </button>
                                <button
                                    className={`px-3 py-2 ${
                                        activeTab === 'api-keys' ? 'font-semibold text-primary' : ''
                                    }`}
                                    onClick={() => setActiveTab('api-keys')}
                                >
                                    <Icon icon="solar:key-minimalistic-bold" width={20} /> API Keys
                                </button>
                            </div>

                            {/* Only render the selected tab's content */}
                            {activeTab === 'appearance' && (
                                <div className="px-4 py-4">
                                    <Card className="border-none shadow-none bg-transparent">
                                        <CardBody>
                                            <SwitchCell
                                                label="Dark Mode"
                                                description="Toggle between light and dark theme"
                                                isSelected={theme === 'dark'}
                                                onValueChange={(isSelected) => setTheme(isSelected ? 'dark' : 'light')}
                                            />
                                        </CardBody>
                                    </Card>
                                </div>
                            )}
                            {activeTab === 'api-keys' && (
                                <div className="px-4 py-4">
                                    <APIKeys className="border-none shadow-none bg-transparent" />
                                </div>
                            )}
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    )
}

export default SettingsModal
