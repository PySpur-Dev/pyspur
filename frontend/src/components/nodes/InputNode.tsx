import { FlowWorkflowNode } from '@/types/api_types/nodeTypeSchemas'
import { convertToPythonVariableName } from '@/utils/variableNameUtils'
import { Alert, Button, Input } from '@heroui/react'
import { Icon } from '@iconify/react'
import { Handle, Position } from '@xyflow/react'
import { isEqual } from 'lodash'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
    deleteWorkflowInputVariable,
    setWorkflowInputVariable,
    updateWorkflowInputVariableKey,
} from '../../store/flowSlice'
import { RootState } from '../../store/store'
import BaseNode from './BaseNode'
import styles from './InputNode.module.css'
import NodeOutputDisplay from './NodeOutputDisplay'

interface InputNodeProps {
    id: string
    data: FlowWorkflowNode['data']
    readOnly?: boolean
}

const InputNode: React.FC<InputNodeProps> = ({ id, data, readOnly = false, ...props }) => {
    const dispatch = useDispatch()
    const nodeRef = useRef<HTMLDivElement | null>(null)
    const [nodeWidth, setNodeWidth] = useState<string>('auto')
    const [editingField, setEditingField] = useState<string | null>(null)
    const [newFieldValue, setNewFieldValue] = useState<string>('')
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
    const [showKeyError, setShowKeyError] = useState<boolean>(false)
    const incomingEdges = useSelector(
        (state: RootState) => state.flow.edges.filter((edge) => edge.target === id),
        isEqual
    )
    const nodeConfig = useSelector((state: RootState) => state.flow.nodeConfigs[id])
    const isFixedOutput = nodeConfig?.has_fixed_output || false

    const outputSchema = nodeConfig?.output_schema || {}
    const outputSchemaKeys = Object.keys(outputSchema)

    useEffect(() => {
        if (nodeRef.current) {
            const incomingSchemaKeys = incomingEdges.map((edge) => edge.source)
            const maxLabelLength = Math.max(
                Math.max(...incomingSchemaKeys.map((label) => label.length)) +
                    Math.max(...outputSchemaKeys.map((label) => label.length)),
                (nodeConfig?.title || '').length / 1.5
            )

            const calculatedWidth = Math.max(300, maxLabelLength * 15)
            const finalWidth = Math.min(calculatedWidth, 600)
            if (finalWidth !== parseInt(nodeWidth)) {
                setNodeWidth(`${finalWidth}px`)
            }
        }
    }, [nodeConfig, outputSchemaKeys])

    const handleAddWorkflowInputVariable = useCallback(() => {
        if (!newFieldValue.trim() || isFixedOutput) return
        const newKey = convertToPythonVariableName(newFieldValue)

        if (newKey !== newFieldValue) {
            setShowKeyError(true)
            setTimeout(() => setShowKeyError(false), 3000)
        }

        dispatch(
            setWorkflowInputVariable({
                key: newKey,
                value: 'string',
            })
        )
        setNewFieldValue('')
    }, [dispatch, newFieldValue, isFixedOutput])

    const handleDeleteWorkflowInputVariable = useCallback(
        (keyToDelete: string) => {
            if (!isFixedOutput) {
                dispatch(deleteWorkflowInputVariable({ key: keyToDelete }))
            }
        },
        [dispatch, isFixedOutput]
    )

    const handleWorkflowInputVariableKeyEdit = useCallback(
        (oldKey: string, newKey: string) => {
            if (isFixedOutput || oldKey === newKey || !newKey.trim()) {
                setEditingField(null)
                return
            }

            const validKey = convertToPythonVariableName(newKey)
            if (validKey !== newKey) {
                setShowKeyError(true)
                setTimeout(() => setShowKeyError(false), 3000)
            }

            dispatch(updateWorkflowInputVariableKey({ oldKey, newKey: validKey }))
            setEditingField(null)
        },
        [dispatch, isFixedOutput]
    )

    const InputHandleRow: React.FC<{ keyName: string }> = ({ keyName }) => {
        return (
            <div
                className={`flex overflow-hidden w-full justify-end whitespace-nowrap items-center`}
                key={keyName}
                id={`input-${keyName}-row`}
            >
                <div className={`${styles.handleCell} ${styles.inputHandleCell}`} id={`input-${keyName}-handle`}>
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={keyName}
                        className={`${styles.handle} ${styles.handleLeft} ${
                            isCollapsed ? styles.collapsedHandleInput : ''
                        }`}
                        isConnectable={!isCollapsed}
                    />
                </div>
                <div className="border-r border-gray-300 h-full mx-0"></div>
                {!isCollapsed && (
                    <div
                        className="align-center flex flex-grow flex-shrink ml-[0.5rem] max-w-full overflow-hidden"
                        id={`input-${keyName}-label`}
                    >
                        {editingField === keyName ? (
                            <Input
                                autoFocus
                                defaultValue={keyName}
                                size="sm"
                                variant="flat"
                                radius="lg"
                                classNames={{
                                    input: 'text-default-900',
                                    inputWrapper: 'shadow-none bg-default-100',
                                }}
                            />
                        ) : (
                            <span
                                className={`${styles.handleLabel} text-sm font-medium cursor-pointer hover:text-primary mr-auto overflow-hidden text-ellipsis whitespace-nowrap`}
                            >
                                {keyName}
                            </span>
                        )}
                    </div>
                )}
            </div>
        )
    }

    const renderWorkflowInputs = () => {
        return (
            <div className="flex w-full flex-row" id="handles">
                {incomingEdges.length > 0 && (
                    <div className={`${styles.handlesColumn} ${styles.inputHandlesColumn}`} id="input-handles">
                        {incomingEdges.map((edge) => (
                            <InputHandleRow key={edge.source} keyName={edge.source} />
                        ))}
                    </div>
                )}
                <div className={`${styles.handlesColumn} border-r mr-1`}>
                    {outputSchemaKeys.length > 0 && (
                        <table style={{ width: '100%' }}>
                            <tbody>
                                {outputSchemaKeys.map((key) => (
                                    <tr key={key} className="relative w-full px-4 py-2">
                                        <td className={styles.handleLabelCell}>
                                            {!isCollapsed && (
                                                <div className="flex items-center gap-2">
                                                    {editingField === key && !readOnly && !isFixedOutput ? (
                                                        <Input
                                                            autoFocus
                                                            defaultValue={key}
                                                            size="sm"
                                                            variant="flat"
                                                            radius="lg"
                                                            onBlur={(e) => {
                                                                const target = e.target as HTMLInputElement
                                                                handleWorkflowInputVariableKeyEdit(key, target.value)
                                                            }}
                                                            onChange={(e) => {
                                                                const target = e.target as HTMLInputElement
                                                                const validValue = convertToPythonVariableName(
                                                                    target.value
                                                                )
                                                                if (validValue !== target.value) {
                                                                    target.value = validValue
                                                                    setShowKeyError(true)
                                                                    setTimeout(() => setShowKeyError(false), 3000)
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                const target = e.target as HTMLInputElement
                                                                if (e.key === 'Enter') {
                                                                    handleWorkflowInputVariableKeyEdit(
                                                                        key,
                                                                        target.value
                                                                    )
                                                                } else if (e.key === 'Escape') {
                                                                    setEditingField(null)
                                                                }
                                                            }}
                                                            classNames={{
                                                                input: 'text-default-900',
                                                                inputWrapper: 'shadow-none bg-default-100',
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col w-full gap-1">
                                                            <div className="flex items-center justify-between">
                                                                <span
                                                                    className={`${styles.handleLabel} text-sm font-medium ${!readOnly && !isFixedOutput ? 'cursor-pointer hover:text-primary' : ''}`}
                                                                    onClick={() =>
                                                                        !readOnly &&
                                                                        !isFixedOutput &&
                                                                        setEditingField(key)
                                                                    }
                                                                >
                                                                    {key}
                                                                </span>
                                                                {!readOnly && !isFixedOutput && (
                                                                    <Button
                                                                        isIconOnly
                                                                        size="sm"
                                                                        variant="light"
                                                                        onClick={() =>
                                                                            handleDeleteWorkflowInputVariable(key)
                                                                        }
                                                                    >
                                                                        <Icon
                                                                            icon="solar:trash-bin-minimalistic-linear"
                                                                            width={16}
                                                                        />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="right-0 w-4 items-center justify-center flex">
                    <Handle
                        type="source"
                        position={Position.Right}
                        id={String(id)}
                        className={`${styles.handle} ${styles.handleRight} ${
                            isCollapsed ? styles.collapsedHandleOutput : ''
                        }`}
                        isConnectable={!isCollapsed}
                    />
                </div>
            </div>
        )
    }

    const renderAddField = () =>
        !isCollapsed &&
        !readOnly &&
        !isFixedOutput && (
            <div className="flex items-center gap-2 px-4 py-2">
                <Input
                    placeholder="Enter new field name"
                    value={newFieldValue}
                    onChange={(e) => {
                        const validValue = convertToPythonVariableName(e.target.value)
                        if (validValue !== e.target.value) {
                            setShowKeyError(true)
                            setTimeout(() => setShowKeyError(false), 3000)
                        }
                        setNewFieldValue(validValue)
                    }}
                    size="sm"
                    variant="bordered"
                    radius="lg"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleAddWorkflowInputVariable()
                        }
                    }}
                    classNames={{
                        input: 'text-default-900 dark:text-default-100 placeholder:text-default-500',
                        inputWrapper: 'shadow-none bg-transparent border-default-200 dark:border-default-700 group-data-[hover=true]:border-default-200 dark:group-data-[hover=true]:border-default-600',
                    }}
                    endContent={
                        <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            onClick={handleAddWorkflowInputVariable}
                            className="text-default-400 hover:text-default-500"
                        >
                            <Icon icon="solar:add-circle-bold" width={16} className="text-default-500" />
                        </Button>
                    }
                />
            </div>
        )

    const baseNodeStyles = useMemo(
        () => ({
            width: nodeWidth,
            maxHeight: '800px',
            overflow: 'auto',
        }),
        [nodeWidth]
    )

    return (
        <div className={styles.inputNodeWrapper}>
            {showKeyError && (
                <Alert
                    className="absolute -top-16 left-0 right-0 z-50"
                    color="warning"
                    onClose={() => setShowKeyError(false)}
                >
                    Variable names cannot contain whitespace. Using underscores instead.
                </Alert>
            )}
            <BaseNode
                id={id}
                isInputNode={true}
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                data={data}
                style={baseNodeStyles}
                className="hover:!bg-background"
                {...props}
            >
                <div className="flex flex-col gap-2">
                    {' '}
                    {/* Add flex container with gap */}
                    <div className={styles.nodeWrapper} ref={nodeRef}>
                        {renderWorkflowInputs()}
                        {renderAddField()}
                    </div>
                </div>
            </BaseNode>
        </div>
    )
}

export default InputNode
