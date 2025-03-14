import React, { useState } from 'react'
import TextEditor from './TextEditor'
import { Button, Card, CardBody, Tab, Tabs } from '@heroui/react'
import _ from 'lodash'
import { Icon } from '@iconify/react'
import { FewShotExamplesProps } from '../../types/fewShot'

interface FewShotExample {
    input?: string
    output?: string
}

// Individual Example Editor Component
interface ExampleEditorModalProps {
    nodeID: string
    exampleIndex: number
    example: FewShotExample
    onSave: () => void
    onDiscard: () => void
    onContentChange: (content: string, tab: 'input' | 'output') => void
    readOnly?: boolean
}

const ExampleEditorModal: React.FC<ExampleEditorModalProps> = ({
    nodeID,
    exampleIndex,
    example,
    onSave,
    onDiscard,
    onContentChange,
    readOnly = false
}) => {
    const [activeTab, setActiveTab] = useState<'input' | 'output'>('input')

    return (
        <div className="w-full px-4 py-10 my-10 bg-content1 dark:bg-content1 rounded-lg shadow-sm">
            <div className="mb-5">
                <div className="flex w-full flex-col items-center">
                    <Tabs
                        aria-label="Input/Output Options"
                        selectedKey={activeTab}
                        onSelectionChange={(key) => setActiveTab(key as 'input' | 'output')}
                        disabledKeys={readOnly ? ['input', 'output'] : []}
                    >
                        <Tab key="input" title="Input" />
                        <Tab key="output" title="Output" />
                    </Tabs>
                </div>
            </div>

            <div className="mb-2 font-medium text-foreground">
                Example {exampleIndex + 1} {activeTab}
            </div>
            <TextEditor
                key={`${activeTab}-${exampleIndex}`}
                content={example[activeTab] || ''}
                setContent={(content) => onContentChange(content, activeTab)}
                isEditable={!readOnly}
                fieldTitle={`Example ${exampleIndex + 1} ${activeTab}`}
                nodeID={nodeID}
                fieldName={`few_shot_examples[${exampleIndex}][${activeTab}]`}
                readOnly={readOnly}
            />

            {!readOnly && (
                <div className="mt-4 flex gap-2">
                    <Button onPress={onDiscard} color="primary" variant="flat">
                        Discard
                    </Button>
                    <Button onPress={onSave} color="primary" variant="solid">
                        Save
                    </Button>
                </div>
            )}
        </div>
    )
}

// Main Few Shot Examples Component
const FewShotExamples: React.FC<FewShotExamplesProps & { readOnly?: boolean }> = ({ nodeID, examples, onChange, readOnly = false }) => {
    const [expandedExampleIndex, setExpandedExampleIndex] = useState<number | null>(null)

    const handleAddExample = () => {
        if (readOnly) return;
        const updatedExamples = [...examples, { input: '', output: '' }]
        onChange(updatedExamples)
        setExpandedExampleIndex(examples.length) // Expand the newly added example
    }

    const handleDeleteExample = (index: number) => {
        if (readOnly) return;
        const updatedExamples = examples.filter((_, idx) => idx !== index)
        onChange(updatedExamples)
        setExpandedExampleIndex(null)
    }

    const handleContentChange = (content: string, tab: 'input' | 'output', index: number) => {
        if (readOnly) return;
        const updatedExamples = _.cloneDeep(examples)
        if (!updatedExamples[index]) {
            updatedExamples[index] = {}
        }
        updatedExamples[index][tab] = content
        onChange(updatedExamples)
    }

    const toggleExample = (index: number) => {
        setExpandedExampleIndex(expandedExampleIndex === index ? null : index)
    }

    return (
        <div className="space-y-4">
            {examples.map((example, index) => (
                <Card key={index} className="bg-content2 dark:bg-content2">
                    <CardBody className="p-4">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <Button
                                    isIconOnly
                                    variant="light"
                                    onPress={() => toggleExample(index)}
                                    isDisabled={readOnly}
                                >
                                    <Icon
                                        icon={expandedExampleIndex === index ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"}
                                        width={20}
                                    />
                                </Button>
                                <span className="font-medium">Example {index + 1}</span>
                            </div>
                            {!readOnly && (
                                <Button
                                    isIconOnly
                                    color="danger"
                                    variant="light"
                                    onPress={() => handleDeleteExample(index)}
                                >
                                    <Icon icon="solar:trash-bin-trash-linear" width={20} />
                                </Button>
                            )}
                        </div>

                        {/* Preview when collapsed */}
                        {expandedExampleIndex !== index && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-sm text-default-500">
                                    <div className="font-medium mb-1">Input</div>
                                    <div className="truncate">{example.input || 'No input'}</div>
                                </div>
                                <div className="text-sm text-default-500">
                                    <div className="font-medium mb-1">Output</div>
                                    <div className="truncate">{example.output || 'No output'}</div>
                                </div>
                            </div>
                        )}

                        {/* Expanded editor */}
                        {expandedExampleIndex === index && (
                            <div className="mt-4">
                                <Tabs aria-label="Input/Output Options" disabledKeys={readOnly ? ['input', 'output'] : []}>
                                    <Tab key="input" title="Input">
                                        <TextEditor
                                            content={example.input || ''}
                                            setContent={(content) => handleContentChange(content, 'input', index)}
                                            isEditable={!readOnly}
                                            fieldTitle={`Example ${index + 1} Input`}
                                            nodeID={nodeID}
                                            fieldName={`few_shot_examples[${index}][input]`}
                                            readOnly={readOnly}
                                        />
                                    </Tab>
                                    <Tab key="output" title="Output">
                                        <TextEditor
                                            content={example.output || ''}
                                            setContent={(content) => handleContentChange(content, 'output', index)}
                                            isEditable={!readOnly}
                                            fieldTitle={`Example ${index + 1} Output`}
                                            nodeID={nodeID}
                                            fieldName={`few_shot_examples[${index}][output]`}
                                            readOnly={readOnly}
                                        />
                                    </Tab>
                                </Tabs>
                            </div>
                        )}
                    </CardBody>
                </Card>
            ))}

            {!readOnly && (
                <Card
                    isPressable
                    onPress={handleAddExample}
                    className="bg-content2 dark:bg-content2 border-2 border-dashed"
                >
                    <CardBody className="flex justify-center items-center p-4">
                        <Icon icon="solar:add-circle-linear" width={24} />
                        <span className="ml-2">Add Example</span>
                    </CardBody>
                </Card>
            )}
        </div>
    )
}

export default FewShotExamples
