import { Alert, Card, CardBody, Tab, Tabs } from '@heroui/react'
import React from 'react'
import { jsonOptions } from '../../../constants/jsonOptions'
import { extractSchemaFromJsonSchema, generateJsonSchemaFromSchema } from '../../../utils/schemaUtils'
import CodeEditor from '../../CodeEditor'
import SchemaEditor from './SchemaEditor'

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

    return (
        <div>
            {error && (
                <Alert color="danger" className="mb-2">
                    <div className="flex items-center gap-2">
                        <span>{error}</span>
                    </div>
                </Alert>
            )}
            <Tabs
                aria-label="Schema Editor Options"
                disabledKeys={readOnly ? ['simple', 'json'] : error ? ['simple'] : []}
                selectedKey={error ? 'json' : 'simple'}
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
