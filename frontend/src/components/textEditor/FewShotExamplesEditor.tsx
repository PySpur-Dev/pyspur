import { Alert, Card, CardBody, Tab, Tabs, Tooltip } from '@heroui/react'
import { Icon } from '@iconify/react'
import React, { useState } from 'react'
import { FewShotExample, FewShotExamplesEditorProps } from '../../types/fewShot'
import CodeEditor from '../CodeEditor'
import FewShotExamples from './FewShotEditor'

const FewShotExamplesEditor: React.FC<FewShotExamplesEditorProps> = ({
    nodeID,
    examples,
    onChange,
    readOnly = false,
}) => {
    const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual')
    const [jsonError, setJsonError] = useState<string>('')

    const handleJsonChange = (jsonContent: string) => {
        if (readOnly) return

        try {
            const parsedContent = JSON.parse(jsonContent)
            if (!Array.isArray(parsedContent)) {
                setJsonError('JSON must be an array of examples')
                return
            }

            const isValid = parsedContent.every(
                (example: FewShotExample) =>
                    typeof example === 'object' &&
                    (example.input === undefined || typeof example.input === 'string') &&
                    (example.output === undefined || typeof example.output === 'string')
            )

            if (!isValid) {
                setJsonError('Each example must have optional "input" and "output" fields of type string')
                return
            }

            setJsonError('')
            onChange(parsedContent)
        } catch (e) {
            setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
        }
    }

    return (
        <div>
            <div className="flex flex-col gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Few Shot Examples</h3>
                    <Tooltip
                        content="Few-Shot prompting helps the AI understand patterns through examples. Each example should have an input and expected output."
                        placement="right"
                    >
                        <Icon icon="solar:question-circle-linear" className="text-default-400 cursor-help" width={20} />
                    </Tooltip>
                </div>
                <Tabs
                    aria-label="Few Shot Editor Options"
                    selectedKey={editorMode}
                    onSelectionChange={(key) => {
                        if (readOnly) return
                        setEditorMode(key as 'visual' | 'json')
                    }}
                    size="sm"
                    disabledKeys={readOnly ? ['visual', 'json'] : []}
                >
                    <Tab key="visual" title="Visual Editor" />
                    <Tab key="json" title="JSON Editor" />
                </Tabs>
            </div>

            {editorMode === 'visual' ? (
                <FewShotExamples nodeID={nodeID} examples={examples} onChange={onChange} readOnly={readOnly} />
            ) : (
                <Card>
                    <CardBody>
                        {jsonError && (
                            <Alert color="danger" className="mb-4">
                                <div className="flex items-center gap-2">
                                    <Icon icon="solar:danger-triangle-bold" className="text-danger" width={20} />
                                    <span>{jsonError}</span>
                                </div>
                            </Alert>
                        )}
                        <div className="mb-2 text-sm text-default-500">
                            Edit all examples in JSON format. Each example should have an &quot;input&quot; and
                            &quot;output&quot; field.
                        </div>
                        <CodeEditor
                            code={JSON.stringify(examples, null, 2)}
                            onChange={handleJsonChange}
                            mode="json"
                            label="All Examples JSON"
                            readOnly={readOnly}
                        />
                    </CardBody>
                </Card>
            )}
        </div>
    )
}

export default FewShotExamplesEditor
