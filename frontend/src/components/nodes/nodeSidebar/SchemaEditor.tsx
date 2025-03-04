import { Alert, Button, Chip, Input, Select, SelectItem, Tooltip } from '@heroui/react'
import { Icon } from '@iconify/react'
import React, { useState } from 'react'
import { isReservedWord } from '../../../utils/schemaValidation'
import { convertToPythonVariableName } from '../../../utils/variableNameUtils'

export interface SchemaEditorProps {
    jsonValue: Record<string, any>
    onChange: (value: Record<string, any>) => void
    options: string[]
    nodeId: string
    availableFields?: string[]
    readOnly?: boolean
}

interface JSONSchema {
    $schema: string
    type: string
    properties: Record<string, any>
    required?: string[]
    items?: JSONSchema
}

interface FieldProps {
    path: string[]
    value: any
    onUpdate: (path: string[], value: any) => void
    onDelete: (path: string[]) => void
    readOnly?: boolean
    availableFields: string[]
    level: number
}

interface SchemaNode {
    type?: string
    properties?: Record<string, any>
    items?: SchemaNode
    required?: string[]
}

const SchemaField: React.FC<FieldProps> = ({ path, value, onUpdate, onDelete, readOnly, availableFields, level }) => {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(path[path.length - 1])
    const [isDragOver, setIsDragOver] = useState(false)
    const [showEnumPanel, setShowEnumPanel] = useState(false)

    // Helper to determine if this is an 'items' field of an array
    const isItemsField = (path: string[]) => {
        return path[path.length - 1] === 'items' && path.length > 1
    }

    const handleDragStart = (e: React.DragEvent) => {
        e.stopPropagation()
        e.dataTransfer.setData(
            'text/plain',
            JSON.stringify({
                path,
                value,
                fieldName: path[path.length - 1],
            })
        )
    }

    const handleDragOver = (e: React.DragEvent) => {
        const type = getTypeFromValue(value)
        if (type === 'object') {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(true)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.stopPropagation()
        setIsDragOver(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        // Ensure drop is only allowed on fields that are objects.
        const targetType = getTypeFromValue(value)
        if (targetType !== 'object') {
            return
        }

        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'))
            if (data.path.join('.') !== path.join('.')) {
                onUpdate(path, {
                    type: 'move',
                    sourceField: data,
                })
            }
        } catch (err) {
            console.error('Failed to parse drag data:', err)
        }
    }

    const handleKeyEdit = (newKey: string) => {
        if (!newKey.trim() || newKey === path[path.length - 1]) {
            setIsEditing(false)
            return
        }

        const validKey = convertToPythonVariableName(newKey)
        onUpdate(path, { type: 'rename', newKey: validKey })
        setIsEditing(false)
    }

    const getTypeFromValue = (val: any): string => {
        if (typeof val === 'object' && val !== null) {
            if (val.type === 'array') return 'array'
            if (val.type) return val.type
            if (val.properties) return 'object'
            if (Object.keys(val).length === 0) return 'object'
            return 'object'
        }
        return val
    }

    const handleEnumUpdate = (enumValues: string[]) => {
        const updatedValue = { ...value }
        if (enumValues.length > 0) {
            updatedValue.enum = enumValues
        } else {
            delete updatedValue.enum
        }
        onUpdate(path, { type: 'update', value: updatedValue })
    }

    const type = getTypeFromValue(value)
    const isObject = type === 'object'
    const hasEnumValues = type === 'string' && value?.enum?.length > 0
    // Check whether this object already has fields.
    const isObjectWithFields =
        isObject &&
        value &&
        typeof value === 'object' &&
        ((value.properties && Object.keys(value.properties).length > 0) ||
            (!value.type && !value.properties && Object.keys(value).length > 0))

    const normalizeSchemaValue = (value: any, newType: string) => {
        // Helper to preserve schema metadata
        const preserveSchemaMetadata = (oldValue: any, newValue: any) => {
            const metadataFields = ['description', 'enum', 'nullable', 'minimum', 'maximum', 'properties', 'required']
            const metadata = {}
            for (const field of metadataFields) {
                if (oldValue && oldValue[field] !== undefined) {
                    metadata[field] = oldValue[field]
                }
            }
            return { ...metadata, ...newValue }
        }

        if (newType === 'object') {
            if (typeof value === 'object' && value !== null) {
                return {
                    ...value,
                    type: 'object',
                    properties: value.properties ? value.properties : {},
                    required: value.required ? value.required : [],
                }
            }
            return {
                type: 'object',
                properties: {},
                required: [],
            }
        } else if (newType === 'array') {
            const baseArray = {
                type: 'array',
                items: value?.items || { type: 'string' },
            }
            return preserveSchemaMetadata(value, baseArray)
        }
        return preserveSchemaMetadata(value, { type: newType })
    }

    const handleTypeChange = (newType: string) => {
        // Prevent switching type if this object already has nested fields.
        if (isObjectWithFields && newType !== 'object') {
            return
        }

        const normalizedValue = normalizeSchemaValue(value, newType)
        onUpdate(path, {
            type: 'update',
            value: normalizedValue,
        })
    }

    const handleTypeChangeWrapper = (e: React.ChangeEvent<HTMLSelectElement>) => {
        handleTypeChange(e.target.value)
    }

    const handleAddNestedField = () => {
        if (!value.properties) {
            value.properties = {}
        }
        onUpdate(path, {
            type: 'add',
            value: 'string',
        })
    }

    // Render nested fields if this is an object type with properties
    const renderNestedFields = () => {
        if (!value || typeof value !== 'object') return null

        // If it has a properties field (JSON Schema format)
        if (value.properties) {
            return Object.entries(value.properties).map(([key, val]) => {
                return (
                    <SchemaField
                        key={key}
                        path={[...path, key]}
                        value={val}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        readOnly={readOnly}
                        availableFields={availableFields}
                        level={level + 1}
                    />
                )
            })
        }

        // If it's a direct object without properties field
        if (!value.type && Object.keys(value).length > 0) {
            return Object.entries(value).map(([key, val]) => {
                return (
                    <SchemaField
                        key={key}
                        path={[...path, key]}
                        value={val}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        readOnly={readOnly}
                        availableFields={availableFields}
                        level={level + 1}
                    />
                )
            })
        }

        return null
    }

    return (
        <div
            className={`mb-2 ${level > 0 ? `ml-${level * 4}` : ''}`}
            draggable={!readOnly}
            onDragStart={handleDragStart}
        >
            <div
                className={`flex flex-col ${
                    isObject ? 'border-2 border-dashed border-default-300 rounded-lg p-2' : ''
                } ${isDragOver ? 'bg-default-200' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="flex items-center gap-2">
                    {isEditing && !readOnly && !isItemsField(path) ? (
                        <Input
                            autoFocus
                            value={editValue}
                            size="sm"
                            variant="faded"
                            radius="lg"
                            onChange={(e) => setEditValue(convertToPythonVariableName(e.target.value))}
                            onBlur={() => handleKeyEdit(editValue)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur()
                                } else if (e.key === 'Escape') {
                                    setIsEditing(false)
                                    setEditValue(path[path.length - 1])
                                }
                            }}
                            classNames={{
                                input: 'bg-default-100',
                                inputWrapper: 'shadow-none',
                            }}
                            className="w-40"
                        />
                    ) : (
                        <Tooltip
                            content="'items' is a required field for arrays and cannot be renamed"
                            isDisabled={!isItemsField(path)}
                            showArrow={true}
                            placement="right"
                        >
                            <span
                                className={`mr-2 p-1 border rounded-full bg-default-100 ${
                                    !readOnly && !isItemsField(path)
                                        ? 'hover:bg-default-200 cursor-pointer'
                                        : isItemsField(path)
                                          ? 'cursor-not-allowed'
                                          : ''
                                }`}
                                onClick={() => !readOnly && !isItemsField(path) && setIsEditing(true)}
                            >
                                {path[path.length - 1]}
                            </span>
                        </Tooltip>
                    )}

                    <Select
                        selectedKeys={[type]}
                        onChange={handleTypeChangeWrapper}
                        isDisabled={readOnly || isObjectWithFields}
                        value={type}
                        className="w-32"
                        isMultiline={true}
                        aria-label="Field type"
                        renderValue={(items) => (
                            <div className="flex flex-wrap gap-1">
                                {items.map((item) => (
                                    <Chip key={item.key} size="sm">
                                        {item.textValue}
                                    </Chip>
                                ))}
                            </div>
                        )}
                    >
                        {availableFields.map((field) => (
                            <SelectItem
                                key={field}
                                value={field}
                                classNames={{
                                    title: 'w-full whitespace-normal break-words',
                                }}
                            >
                                {field}
                            </SelectItem>
                        ))}
                    </Select>

                    {type === 'string' && !readOnly && (
                        <Button
                            isIconOnly
                            radius="full"
                            variant="light"
                            onPress={() => setShowEnumPanel(!showEnumPanel)}
                            color={hasEnumValues ? 'primary' : 'default'}
                            className="ml-1"
                            aria-label="Edit enum values"
                        >
                            <Icon icon="solar:list-linear" width={18} />
                        </Button>
                    )}

                    {!readOnly && (
                        <Button
                            isIconOnly
                            radius="full"
                            variant="light"
                            onPress={() => onDelete(path)}
                            color="primary"
                            aria-label="Delete field"
                        >
                            <Icon icon="solar:trash-bin-trash-linear" width={22} />
                        </Button>
                    )}
                </div>

                {showEnumPanel && type === 'string' && (
                    <EnumPanel value={value} onUpdate={handleEnumUpdate} readOnly={readOnly} />
                )}

                {isObject && (
                    <div className="ml-4 mt-2">
                        {renderNestedFields()}
                        {!readOnly && (
                            <Button
                                size="sm"
                                variant="light"
                                color="primary"
                                onPress={handleAddNestedField}
                                className="mt-2"
                                aria-label="Add nested field"
                            >
                                <Icon icon="solar:add-circle-linear" className="mr-1" width={18} />
                                Add Field
                            </Button>
                        )}
                    </div>
                )}

                {type === 'array' && (
                    <div className="ml-4 mt-2">
                        {value.items ? (
                            <SchemaField
                                key={`${path.join('.')}-items`}
                                path={[...path, 'items']}
                                value={value.items}
                                onUpdate={onUpdate}
                                onDelete={onDelete}
                                readOnly={readOnly}
                                availableFields={availableFields}
                                level={level + 1}
                            />
                        ) : (
                            !readOnly && (
                                <Button
                                    size="sm"
                                    variant="light"
                                    color="primary"
                                    onPress={() =>
                                        onUpdate(path, {
                                            type: 'update',
                                            value: { ...value, items: { type: availableFields[0] } },
                                        })
                                    }
                                    aria-label="Add items schema"
                                >
                                    <Icon icon="solar:add-circle-linear" className="mr-1" width={18} />
                                    Add Items Schema
                                </Button>
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

interface DraggableEnumChipProps {
    value: string
    index: number
    onRemove?: () => void
    onReorder: (dragIndex: number, hoverIndex: number) => void
    readOnly?: boolean
}

const DraggableEnumChip: React.FC<DraggableEnumChipProps> = ({ value, index, onRemove, onReorder, readOnly }) => {
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        e.stopPropagation() // Prevent parent field drag
        e.dataTransfer.setData('application/enum-index', String(index))
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()

        const dragIndex = parseInt(e.dataTransfer.getData('application/enum-index'))
        if (dragIndex !== index) {
            onReorder(dragIndex, index)
        }
    }

    return (
        <div
            draggable={!readOnly}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={!readOnly ? 'cursor-move' : ''}
            onClick={(e) => e.stopPropagation()}
        >
            <Chip
                onClose={!readOnly ? onRemove : undefined}
                variant="flat"
                color="primary"
                startContent={
                    !readOnly && <Icon icon="solar:menu-dots-bold" className="mr-1 text-default-400" width={14} />
                }
            >
                {value}
            </Chip>
        </div>
    )
}

interface EnumPanelProps {
    value: any
    onUpdate: (enumValues: string[]) => void
    readOnly?: boolean
}

const EnumPanel: React.FC<EnumPanelProps> = ({ value, onUpdate, readOnly = false }) => {
    const [newEnumValue, setNewEnumValue] = useState<string>('')
    const enumValues = value?.enum || []

    const handleAddEnum = () => {
        if (!newEnumValue.trim() || enumValues.includes(newEnumValue)) {
            return
        }
        const updatedEnums = [...enumValues, newEnumValue]
        onUpdate(updatedEnums)
        setNewEnumValue('')
    }

    const handleRemoveEnum = (valueToRemove: string) => {
        const updatedEnums = enumValues.filter((v: string) => v !== valueToRemove)
        onUpdate(updatedEnums)
    }

    const handleReorderEnums = (dragIndex: number, hoverIndex: number) => {
        const reorderedEnums = [...enumValues]
        const [removed] = reorderedEnums.splice(dragIndex, 1)
        reorderedEnums.splice(hoverIndex, 0, removed)
        onUpdate(reorderedEnums)
    }

    // Stop propagation of drag events to parent
    const preventDragPropagation = (e: React.DragEvent) => {
        e.stopPropagation()
    }

    return (
        <div
            className="mt-2 p-3 bg-default-100 rounded-lg border border-default-200"
            onDragStart={preventDragPropagation}
            onDragOver={preventDragPropagation}
            onDrop={preventDragPropagation}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h4 className="text-small font-medium">Enum Values</h4>
                    <p className="text-tiny text-default-500">
                        {enumValues.length
                            ? `Select one of these ${enumValues.length} options:`
                            : 'Add values to create an enum:'}
                    </p>
                </div>
                {enumValues.length > 0 && (
                    <Chip size="sm" variant="flat">
                        {enumValues.length} options
                    </Chip>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mb-3 min-h-[40px] p-2 bg-default-50 rounded border border-dashed border-default-300">
                {enumValues.map((enumValue: string, index: number) => (
                    <DraggableEnumChip
                        key={enumValue}
                        value={enumValue}
                        index={index}
                        onRemove={() => handleRemoveEnum(enumValue)}
                        onReorder={handleReorderEnums}
                        readOnly={readOnly}
                    />
                ))}
                {enumValues.length === 0 && <div className="text-tiny text-default-400 p-1">No enum values yet</div>}
            </div>

            {!readOnly && (
                <div className="flex gap-2">
                    <Input
                        type="text"
                        value={newEnumValue}
                        onChange={(e) => setNewEnumValue(e.target.value)}
                        placeholder="Add enum value..."
                        size="sm"
                        startContent={<Icon icon="solar:add-circle-linear" className="text-default-400" width={16} />}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newEnumValue) {
                                e.preventDefault()
                                handleAddEnum()
                            }
                        }}
                    />
                    <Button
                        isIconOnly
                        radius="full"
                        variant="flat"
                        onPress={handleAddEnum}
                        color="primary"
                        disabled={!newEnumValue}
                        size="sm"
                        aria-label="Add enum value"
                    >
                        <Icon icon="solar:add-circle-linear" width={18} />
                    </Button>
                </div>
            )}
        </div>
    )
}

const SchemaEditor: React.FC<SchemaEditorProps> = ({
    jsonValue,
    onChange,
    options,
    nodeId,
    availableFields = ['string', 'boolean', 'integer', 'number', 'array', 'object'],
    readOnly = false,
}) => {
    const [newKey, setNewKey] = useState<string>('')
    const [newType, setNewType] = useState<string>(availableFields[0])
    const [error, setError] = useState<string>('')

    // New utility function to generate default schema structures
    const getDefaultSchemaForType = (type: string) => {
        switch (type) {
            case 'object':
                return { type: 'object', properties: {}, required: [] }
            case 'array':
                return {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {},
                        required: [],
                    },
                }
            case 'null':
                return { type: 'null' }
            default:
                return { type }
        }
    }

    const sanitizeSchemaForLLMs = (schema: any): any => {
        // Adds required and additionalProperties fields to object schemas recursively
        // This is to ensure the schema is in a format that LLMs can work with
        schema = JSON.parse(JSON.stringify(schema)) // Deep copy to avoid mutating the original schema
        if (schema && typeof schema === 'object') {
            if (schema.type === 'object' && schema.properties) {
                schema.required = Object.keys(schema.properties)
                schema.additionalProperties = false
                Object.keys(schema.properties).forEach((key) => {
                    schema.properties[key] = sanitizeSchemaForLLMs(schema.properties[key])
                })
            } else if (schema.type === 'array' && schema.items) {
                schema.items = sanitizeSchemaForLLMs(schema.items)
            }
        }
        return schema
    }

    // Modified helper function to update the entire schema using the recursive helper
    const handleSchemaChange = (updatedSchema: JSONSchema) => {
        const finalSchema = sanitizeSchemaForLLMs(updatedSchema)
        onChange(finalSchema)
    }

    // Update the schema normalization to handle nested structures
    const normalizeSchema = (value: any): any => {
        if (typeof value === 'string') {
            return { type: value }
        }
        if (typeof value === 'object' && value !== null) {
            // If it's already a valid schema object with type and properties
            if (value.type === 'object') {
                return {
                    ...value, // Preserve all original fields
                    type: 'object',
                    properties: Object.entries(value.properties || {}).reduce((acc, [k, v]) => {
                        acc[k] = normalizeSchema(v)
                        return acc
                    }, {}),
                    required: value.required || [],
                }
            }
            // If it has an explicit type
            if (value.type) {
                // Preserve enum values for string types
                if (value.type === 'string' && Array.isArray(value.enum)) {
                    return {
                        ...value,
                        type: 'string',
                        enum: value.enum,
                    }
                }
                return value
            }
            // If it has properties but no type
            if (value.properties) {
                return {
                    type: 'object',
                    properties: Object.entries(value.properties).reduce((acc, [k, v]) => {
                        acc[k] = normalizeSchema(v)
                        return acc
                    }, {}),
                    required: value.required || [],
                }
            }
            // If it's a plain object
            return {
                type: 'object',
                properties: Object.entries(value).reduce((acc, [k, v]) => {
                    acc[k] = normalizeSchema(v)
                    return acc
                }, {}),
                required: [],
            }
        }
        return { type: 'string' } // fallback
    }

    const schemaForEditing: JSONSchema = {
        $schema: jsonValue?.$schema || 'http://json-schema.org/draft-07/schema#',
        type: jsonValue?.type || 'object',
        properties:
            jsonValue && jsonValue.properties
                ? Object.entries(jsonValue.properties).reduce(
                      (acc, [key, value]) => {
                          acc[key] = normalizeSchema(value)
                          return acc
                      },
                      {} as Record<string, any>
                  )
                : Object.entries(jsonValue || {}).reduce(
                      (acc, [key, value]) => {
                          acc[key] = normalizeSchema(value)
                          return acc
                      },
                      {} as Record<string, any>
                  ),
        required: jsonValue?.properties ? Object.keys(jsonValue.properties) : [],
    }

    const getPlaceholderExample = (): string => {
        return 'eg. summary'
    }

    const handleAddKey = (): void => {
        const validatedKey = convertToPythonVariableName(newKey)

        // Check if the key is a reserved word
        if (isReservedWord(validatedKey)) {
            setError(`"${validatedKey}" is a Python reserved word and cannot be used as a field name`)
            return
        }

        if (schemaForEditing.properties.hasOwnProperty(validatedKey)) {
            setError(`Field name "${validatedKey}" already exists`)
            return
        }

        setError('') // Clear any previous errors
        const newField = getDefaultSchemaForType(newType)
        const updatedProperties = {
            ...schemaForEditing.properties,
            [validatedKey]: newField,
        }
        const updatedSchema = {
            ...schemaForEditing,
            properties: updatedProperties,
        }
        handleSchemaChange(updatedSchema)
        setNewKey('')
        setNewType(availableFields[0])
    }

    const handleFieldUpdate = (
        path: string[],
        action: { type: string; value?: any; newKey?: string; sourceField?: any }
    ): void => {
        let updatedSchema = { ...schemaForEditing }

        // Helper function to traverse the schema based on a path
        const getContainerAndKey = (schema: any, path: string[]) => {
            let node = schema
            for (let i = 0; i < path.length - 1; i++) {
                const segment = path[i]
                if (node.type === 'object') {
                    if (!node.properties) {
                        node.properties = {}
                    }
                    if (!node.properties[segment]) {
                        node.properties[segment] = { type: 'object', properties: {}, required: [] }
                    }
                    node = node.properties[segment]
                } else if (node.type === 'array' && segment === 'items') {
                    if (!node.items) {
                        node.items = { type: 'object', properties: {}, required: [] }
                    }
                    node = node.items
                } else {
                    console.error(`Unknown node type encountered during traversal at segment '${segment}'`)
                    return null
                }
            }
            return { container: node, key: path[path.length - 1] }
        }

        const traversal = getContainerAndKey(updatedSchema, path)
        if (!traversal) {
            console.error('Failed to traverse schema with path', path)
            return
        }
        const { container, key } = traversal

        if (action.type === 'add') {
            let targetObj

            // If we're dealing with an array's items
            if (container.type === 'array' && key === 'items') {
                if (!container.items.properties) {
                    container.items.properties = {}
                }
                targetObj = container.items.properties
            }
            // If we're dealing with a nested object field
            else if (container.properties && container.properties[key] && container.properties[key].type === 'object') {
                if (!container.properties[key].properties) {
                    container.properties[key].properties = {}
                }
                targetObj = container.properties[key].properties
            }
            // If we're dealing with a regular object
            else if (container.type === 'object') {
                if (!container.properties) {
                    container.properties = {}
                }
                targetObj = container.properties
            }

            if (targetObj) {
                let newFieldName = 'new_field'
                let counter = 1
                while (newFieldName in targetObj) {
                    newFieldName = `new_field_${counter}`
                    counter++
                }
                // Use getDefaultSchemaForType instead of inline schema creation
                const newFieldValue = getDefaultSchemaForType(action.value || 'string')
                targetObj[newFieldName] = newFieldValue

                // Update required fields
                if (container.type === 'array' && key === 'items') {
                    container.items.required = Object.keys(targetObj)
                } else if (
                    container.properties &&
                    container.properties[key] &&
                    container.properties[key].type === 'object'
                ) {
                    container.properties[key].required = Object.keys(targetObj)
                } else if (container.type === 'object') {
                    container.required = Object.keys(targetObj)
                }
            }
        } else if (action.type === 'move') {
            const sourceField = action.sourceField
            const sourcePath: string[] = sourceField.path
            const sourceFieldName = sourceField.fieldName

            const sourceTraversal = getContainerAndKey(updatedSchema, sourcePath)
            if (!sourceTraversal) {
                console.error('Failed to traverse source path', sourcePath)
                return
            }
            const { container: sourceContainer } = sourceTraversal
            if (sourceContainer.properties && sourceContainer.properties[sourceFieldName]) {
                delete sourceContainer.properties[sourceFieldName]
            }

            if (!container.properties[key]) {
                container.properties[key] = { type: 'object', properties: {}, required: [] }
            }
            if (!container.properties[key].properties) {
                container.properties[key].properties = {}
            }
            container.properties[key].properties = {
                ...container.properties[key].properties,
                [sourceFieldName]: sourceField.value,
            }
            container.properties[key].required = Object.keys(container.properties[key].properties)

            updatedSchema.required = Object.keys(updatedSchema.properties)
        } else if (action.type === 'rename') {
            if (container.properties[key]) {
                const oldKey = key
                const newKey = action.newKey!
                if (oldKey !== newKey) {
                    const value = container.properties[oldKey]
                    delete container.properties[oldKey]
                    container.properties[newKey] = value
                }
            }
        } else if (action.type === 'update') {
            if (container.type === 'array' && key === 'items') {
                // Handle array items update
                container.items = typeof action.value === 'string' ? { type: action.value } : action.value
            } else if (container.properties && container.properties[key]) {
                // Handle regular property update
                container.properties[key] = typeof action.value === 'string' ? { type: action.value } : action.value
            }
        }
        handleSchemaChange(updatedSchema)
    }

    const handleFieldDelete = (path: string[]): void => {
        let updatedSchema = { ...schemaForEditing }
        let current: SchemaNode = updatedSchema

        // Traverse to the parent of the field to delete
        for (let i = 0; i < path.length - 1; i++) {
            if (current.type === 'object' && current.properties) {
                if (!current.properties[path[i]]) {
                    console.error('Path does not exist during traversal:', path[i])
                    return
                }
                current = current.properties[path[i]]
            } else if (current.type === 'array' && current.items && path[i] === 'items') {
                current = current.items
            } else {
                console.error('Invalid schema structure during traversal')
                return
            }
        }

        // Delete the field
        const fieldToDelete = path[path.length - 1]
        if (current.properties) {
            delete current.properties[fieldToDelete]
            current.required = Object.keys(current.properties)
        }

        handleSchemaChange(updatedSchema)
    }

    const handleDropOnRoot = (e: React.DragEvent<HTMLDivElement>): void => {
        e.preventDefault()
        e.stopPropagation()
        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'))
            let updatedSchema = JSON.parse(JSON.stringify(schemaForEditing))

            if (data.path.length > 1) {
                let parentObj = updatedSchema.properties
                for (let i = 0; i < data.path.length - 1; i++) {
                    parentObj = parentObj[data.path[i]]
                }
                if (parentObj && parentObj.properties) {
                    delete parentObj.properties[data.fieldName]
                    parentObj.required = Object.keys(parentObj.properties)
                }
            }

            updatedSchema.properties[data.fieldName] = data.value
            updatedSchema.required = Object.keys(updatedSchema.properties)

            handleSchemaChange(updatedSchema)
        } catch (err) {
            console.error('Failed to handle drop on root:', err)
        }
    }

    return (
        <div
            className={`schema-editor ${readOnly ? 'opacity-75 cursor-not-allowed' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnRoot}
        >
            {!readOnly && (
                <div className="mb-4 flex flex-col space-y-2">
                    {error && (
                        <Alert color="danger" className="mb-2">
                            {error}
                        </Alert>
                    )}
                    <div className="flex items-center space-x-4">
                        <Input
                            type="text"
                            value={newKey}
                            onChange={(e) => {
                                setNewKey(convertToPythonVariableName(e.target.value))
                                setError('') // Clear error when input changes
                            }}
                            onBlur={(e) => setNewKey(convertToPythonVariableName(e.target.value))}
                            placeholder={getPlaceholderExample()}
                            label="Name"
                            disabled={readOnly}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !readOnly && newKey) {
                                    e.currentTarget.blur()
                                    handleAddKey()
                                }
                            }}
                            className="p-2 flex-grow w-2/3"
                        />
                        <Select
                            selectedKeys={[newType]}
                            onChange={(e) => setNewType(e.target.value)}
                            disabled={readOnly}
                            label="Type"
                            className="w-32"
                            isMultiline={true}
                            aria-label="New field type"
                            renderValue={(items) => (
                                <div className="flex flex-wrap gap-1">
                                    {items.map((item) => (
                                        <Chip key={item.key} size="sm">
                                            {item.textValue}
                                        </Chip>
                                    ))}
                                </div>
                            )}
                        >
                            {availableFields.map((field) => (
                                <SelectItem
                                    key={field}
                                    value={field}
                                    classNames={{
                                        title: 'w-full whitespace-normal break-words',
                                    }}
                                >
                                    {field}
                                </SelectItem>
                            ))}
                        </Select>
                        <Button
                            isIconOnly
                            radius="full"
                            variant="light"
                            onPress={handleAddKey}
                            color="primary"
                            disabled={readOnly || !newKey}
                            aria-label="Add new field"
                        >
                            <Icon icon="solar:add-circle-linear" width={22} />
                        </Button>
                    </div>
                </div>
            )}
            {schemaForEditing &&
                typeof schemaForEditing.properties === 'object' &&
                Object.entries(schemaForEditing.properties).map(([key, value]) => (
                    <SchemaField
                        key={key}
                        path={[key]}
                        value={value}
                        onUpdate={handleFieldUpdate}
                        onDelete={handleFieldDelete}
                        readOnly={readOnly}
                        availableFields={availableFields}
                        level={0}
                    />
                ))}
        </div>
    )
}

export default SchemaEditor
