import { Alert, Button, Card, CardBody, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup, Tab, Tabs, Textarea, Tooltip, useDisclosure } from '@heroui/react'
import { Icon } from '@iconify/react'
import React, { useState, useEffect } from 'react'
import { jsonOptions } from '../../../constants/jsonOptions'
import { extractSchemaFromJsonSchema, generateJsonSchemaFromSchema } from '../../../utils/schemaUtils'
import CodeEditor from '../../CodeEditor'
import SchemaEditor from './SchemaEditor'
import axios from 'axios'

interface OutputSchemaEditorProps {
    nodeID: string
    schema: string
    readOnly?: boolean
    error?: string
    onChange: (newSchema: string) => void
}

const OutputSchemaEditor: React.FC<OutputSchemaEditorProps> = ({
    nodeID,
    schema,
    readOnly = false,
    error = '',
    onChange,
}) => {
    const { schema: parsedSchema } = extractSchemaFromJsonSchema(schema || '')
    const [selectedTab, setSelectedTab] = useState(error ? 'json' : 'simple')
    const [isGenerating, setIsGenerating] = useState(false)
    const [description, setDescription] = useState('')
    const [generationError, setGenerationError] = useState('')
    const [hasOpenAIKey, setHasOpenAIKey] = useState<boolean>(false)
    const [generationType, setGenerationType] = useState<'new' | 'enhance'>('new')
    const { isOpen, onOpen, onClose } = useDisclosure()

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

    // Helper function to reset modal state
    const resetModalState = () => {
        setDescription('')
        setGenerationError('')
        setGenerationType('new')
        onClose()
    }

    const handleSchemaEditorChange = (newValue: any) => {
        if (!readOnly) {
            if (typeof newValue === 'object' && !('type' in newValue)) {
                const jsonSchema = generateJsonSchemaFromSchema(newValue)
                if (jsonSchema) {
                    onChange(jsonSchema)
                }
            } else {
                onChange(JSON.stringify(newValue, null, 2))
            }
        }
    }

    const handleJsonEditorChange = (value: string) => {
        if (!readOnly) {
            onChange(value)
        }
    }

    const handleGenerateSchema = async () => {
        if (!description.trim()) {
            setGenerationError('Please enter a description')
            return
        }

        setIsGenerating(true)
        setGenerationError('')

        try {
            const response = await axios.post('/api/ai/generate_schema/', {
                description: description,
                existing_schema: generationType === 'enhance' ? schema : undefined
            })

            const newSchema = JSON.stringify(response.data, null, 2)
            onChange(newSchema)
            resetModalState()
        } catch (error: any) {
            setGenerationError(error.response?.data?.detail || 'Failed to generate schema')
        } finally {
            setIsGenerating(false)
        }
    }

    const renderGenerateButton = () => {
        if (readOnly) return null

        const button = (
            <Button
                size="sm"
                color="primary"
                variant="light"
                startContent={<Icon icon="solar:magic-stick-linear" width={20} />}
                onClick={onOpen}
                isDisabled={!hasOpenAIKey}
            >
                AI Generate
            </Button>
        )

        if (!hasOpenAIKey) {
            return (
                <Tooltip
                    content="OpenAI API key is required for AI schema generation. Please add your API key in the settings."
                    placement="top"
                >
                    {button}
                </Tooltip>
            )
        }

        return button
    }

    return (
        <div>
            {error && (
                <Alert color="danger" className="mb-2">
                    <div className="flex items-center gap-2">
                        <span>{error}</span>
                    </div>
                </Alert>
            )}
            {generationError && (
                <Alert color="danger" className="mb-2">
                    <div className="flex items-center gap-2">
                        <span>{generationError}</span>
                    </div>
                </Alert>
            )}
            <div className="flex items-center gap-2 mb-2">
                {renderGenerateButton()}
            </div>

            <Modal
                isOpen={isOpen}
                onClose={resetModalState}
                size="2xl"
            >
                <ModalContent>
                    <ModalHeader className="flex flex-col gap-1">
                        Generate Schema
                    </ModalHeader>
                    <ModalBody>
                        <RadioGroup
                            value={generationType}
                            onValueChange={(value) => setGenerationType(value as 'new' | 'enhance')}
                            className="mb-4"
                        >
                            <Radio value="new">Create New Schema</Radio>
                            <Radio
                                value="enhance"
                                isDisabled={!schema}
                                description={!schema ? "No existing schema to enhance" : undefined}
                            >
                                Enhance Existing Schema
                            </Radio>
                        </RadioGroup>

                        {generationType === 'enhance' && schema && (
                            <Card className="mb-4">
                                <CardBody>
                                    <div className="text-sm font-semibold mb-2">Current Schema:</div>
                                    <CodeEditor
                                        code={schema}
                                        mode="json"
                                        readOnly={true}
                                        height="150px"
                                        onChange={() => {}}
                                    />
                                </CardBody>
                            </Card>
                        )}

                        <Textarea
                            label={generationType === 'new'
                                ? "Describe the schema you want to generate"
                                : "Describe how you want to enhance the schema"
                            }
                            placeholder={generationType === 'new'
                                ? "Example: A schema for a user profile with name, email, age, and a list of hobbies"
                                : "Example: Add a phone number field and make email required"
                            }
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="mb-2"
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            size="sm"
                            variant="light"
                            onClick={resetModalState}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            color="primary"
                            onClick={handleGenerateSchema}
                            isLoading={isGenerating}
                        >
                            Generate
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Tabs
                aria-label="Schema Editor Options"
                disabledKeys={readOnly ? ['simple', 'json'] : error ? ['simple'] : []}
                selectedKey={selectedTab}
                onSelectionChange={(key) => {
                    if (error && key === 'simple') {
                        return // Prevent switching to simple editor when there are errors
                    }
                    setSelectedTab(key as string)
                }}
            >
                <Tab key="simple" title="Simple Editor">
                    {parsedSchema && (
                        <Card>
                            <CardBody>
                                <SchemaEditor
                                    key={`schema-editor-output-${nodeID}`}
                                    jsonValue={parsedSchema}
                                    onChange={handleSchemaEditorChange}
                                    options={jsonOptions}
                                    nodeId={nodeID}
                                    readOnly={readOnly}
                                />
                            </CardBody>
                        </Card>
                    )}
                </Tab>
                <Tab key="json" title="JSON Schema">
                    <Card>
                        <CardBody>
                            <CodeEditor
                                key={`code-editor-output-json-schema-${nodeID}`}
                                code={schema || ''}
                                mode="json"
                                onChange={handleJsonEditorChange}
                                readOnly={readOnly}
                            />
                        </CardBody>
                    </Card>
                </Tab>
            </Tabs>
        </div>
    )
}

export default OutputSchemaEditor
