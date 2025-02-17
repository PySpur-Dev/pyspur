import usePartialRun from '@/hooks/usePartialRun'
import store, { RootState } from '@/store/store'
import { AlertState } from '@/types/alert'
import { FlowWorkflowNode } from '@/types/api_types/nodeTypeSchemas'
import { TaskStatus } from '@/types/api_types/taskSchemas'
import { deleteNode, duplicateNode, getNodeTitle } from '@/utils/flowUtils'
import { convertToPythonVariableName } from '@/utils/variableNameUtils'
import { Alert, Button, Card, CardBody, CardHeader, Divider, Input } from '@heroui/react'
import { Icon } from '@iconify/react'
import { createSelector } from '@reduxjs/toolkit'
import { Handle, Position, useConnection, useNodeConnections, useUpdateNodeInternals } from '@xyflow/react'
import isEqual from 'lodash/isEqual'
import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { updateNodeDataOnly, updateNodeParentAndCoordinates, updateNodeTitle } from '../../store/flowSlice'
import NodeControls from './NodeControls'
import styles from './BaseNode.module.css'
import { isTargetAncestorOfSource } from '@/utils/cyclicEdgeUtils'
import NodeErrorDisplay from './NodeErrorDisplay'
import NodeOutputDisplay from './NodeOutputDisplay'
import { debounce } from 'lodash'

const PUBLIC_URL = typeof window !== 'undefined' ? `http://${window.location.host}/` : 'http://localhost:6080/'

export interface BaseNodeProps {
    isCollapsed: boolean
    setIsCollapsed: (collapsed: boolean) => void
    id: string
    data?: FlowWorkflowNode['data']
    children?: React.ReactNode
    style?: React.CSSProperties
    isInputNode?: boolean
    className?: string
    isResizable?: boolean
    handleOpenModal?: (isModalOpen: boolean) => void
    positionAbsoluteX?: number
    positionAbsoluteY?: number
    renderOutputHandles?: () => React.ReactNode
}

const staticStyles = {
    container: {
        position: 'relative' as const,
    },
    targetHandle: {
        top: '50%',
        left: 0,
        width: '30%',
        height: '100%',
        zIndex: 10,
        opacity: 0,
        pointerEvents: 'auto' as const,
    },
    dragHandle: {
        width: '100%',
        height: '100%',
        pointerEvents: 'none' as const,
    },
    controlsCard: {
        position: 'absolute' as const,
        top: '-45px',
        right: '0px',
        padding: '8px',
        backdropFilter: 'blur(8px)',
        backgroundColor: 'var(--background)',
        border: '1px solid var(--default-200)',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        pointerEvents: 'auto' as const,
    },
    baseTag: {
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        display: 'inline-flex',
        alignItems: 'center',
        color: '#fff',
        fontWeight: '500',
        letterSpacing: '0.025em',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    },
    collapseButton: {
        minWidth: 'auto',
        height: '28px',
        width: '28px',
        padding: '0',
        fontSize: '0.8rem',
        marginRight: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '8px',
        transition: 'all 0.2s ease',
        backgroundColor: 'var(--background)',
        border: '1px solid var(--default-200)',
    },
    controlsContainer: {
        position: 'absolute' as const,
        top: '8px',
        right: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    },
} as const

const baseNodeComparator = (prev: BaseNodeProps, next: BaseNodeProps) => {
    return (
        prev.isCollapsed === next.isCollapsed &&
        prev.id === next.id &&
        isEqual(prev.data, next.data) &&
        isEqual(prev.style, next.style) &&
        prev.isInputNode === next.isInputNode &&
        prev.className === next.className &&
        prev.isResizable === next.isResizable &&
        prev.positionAbsoluteX === next.positionAbsoluteX &&
        prev.positionAbsoluteY === next.positionAbsoluteY
    )
}

const selectInitialInputs = createSelector(
    (state: RootState) => state.flow.nodes,
    (state: RootState) => state.flow.testInputs,
    (nodes, testInputs) => {
        const inputNode = nodes.find((node) => node.type === 'InputNode')
        const inputNodeId = inputNode?.data?.title || inputNode?.id
        if (testInputs && Array.isArray(testInputs) && testInputs.length > 0) {
            const { id, ...rest } = testInputs[0]
            return { [inputNodeId as string]: rest }
        }
        return { [inputNodeId as string]: {} }
    }
)

const selectAvailableOutputs = createSelector([(state: RootState) => state.flow.nodes], (nodes) => {
    const outputs: Record<string, any> = {}
    nodes.forEach((node) => {
        if (node.data?.run) {
            outputs[node.data?.title || node.id] = node.data.run
        }
    })
    return outputs
})

const BaseNode: React.FC<BaseNodeProps> = ({
    isCollapsed,
    setIsCollapsed,
    handleOpenModal,
    id,
    data,
    children,
    style = {},
    isInputNode = false,
    className = '',
    isResizable = false,
    positionAbsoluteX,
    positionAbsoluteY,
    renderOutputHandles,
}) => {
    const [editingTitle, setEditingTitle] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const [titleInputValue, setTitleInputValue] = useState('')
    const [alert, setAlert] = useState<AlertState>({
        message: '',
        color: 'default',
        isVisible: false,
    })
    const dispatch = useDispatch()

    const connection = useConnection()

    // Only keep the selectors we need for this component's functionality
    const selectedNodeId = useSelector((state: RootState) => state.flow.selectedNode)
    const parentId = useSelector((state: RootState) => state.flow.nodes.find((n) => n.id === id)?.parentId)
    const nodePosition = useSelector((state: RootState) => state.flow.nodes.find((n) => n.id === id)?.position)
    const parentPosition = useSelector((state: RootState) =>
        parentId ? state.flow.nodes.find((n) => n.id === parentId)?.position : undefined
    )

    const initialInputs = useSelector(selectInitialInputs, isEqual)

    const availableOutputs = useSelector(selectAvailableOutputs, isEqual)

    const { executePartialRun, loading } = usePartialRun(dispatch)

    const showAlert = (message: string, color: AlertState['color']) => {
        setAlert({ message, color, isVisible: true })
        setTimeout(() => setAlert((prev) => ({ ...prev, isVisible: false })), 3000)
    }

    const handleDelete = () => {
        deleteNode(id, selectedNodeId, dispatch)
    }

    const handleDuplicate = () => {
        if (!data) {
            console.error('Node data not found')
            return
        }

        duplicateNode(id, dispatch, store.getState as () => RootState)
    }
    const nodeData = data
    const edges = useSelector((state: RootState) => state.flow.edges, isEqual)
    const nodes = useSelector((state: RootState) => state.flow.nodes, isEqual)

    const updateNodeInternals = useUpdateNodeInternals()

    const [predecessorNodes, setPredecessorNodes] = useState(() => {
        return edges
            .filter((edge) => edge.target === id)
            .map((edge) => {
                const sourceNode = nodes.find((node) => node.id === edge.source)
                if (!sourceNode) return null
                if (sourceNode.type === 'RouterNode' && edge.sourceHandle) {
                    return {
                        ...sourceNode,
                        handle_id: edge.targetHandle
                    }
                }
                return sourceNode
            })
            .filter(Boolean)
    })

    const handleDetach = () => {
        if (!data || !nodePosition || !parentPosition) return

        // Add parent's position to maintain absolute position after detaching
        const absolutePosition = {
            x: nodePosition.x + parentPosition.x,
            y: nodePosition.y + parentPosition.y,
        }

        dispatch(
            updateNodeParentAndCoordinates({
                nodeId: id,
                parentId: undefined,
                position: absolutePosition,
            })
        )
    }

    const handlePartialRun = async () => {
        if (!data) {
            return
        }
        setIsRunning(true)
        // Clear the current node's run data before starting new run
        dispatch(
            updateNodeDataOnly({
                id,
                data: {
                    run: undefined,
                    taskStatus: 'RUNNING',
                    error: undefined,
                },
            })
        )

        const rerunPredecessors = false
        const workflowId = window.location.pathname.split('/').pop()
        if (!workflowId) return

        try {
            const result = await executePartialRun({
                workflowId,
                nodeId: data.title,
                initialInputs,
                partialOutputs: availableOutputs,
                rerunPredecessors,
            })

            if (result) {
                showAlert('Node execution completed successfully', 'success')
            }
        } catch (error: any) {
            console.error('Error running node:', error)
            const errorMessage =
                error.response?.data?.detail || 'Node execution failed. Please check the inputs and try again.'
            showAlert(errorMessage, 'danger')
        } finally {
            setIsRunning(false)
        }
    }

    const isSelected = String(id) === String(selectedNodeId)

    const status = data?.run ? 'completed' : ''

    const nodeRunStatus: TaskStatus = data?.taskStatus as TaskStatus

    let outlineColor = 'gray'

    switch (nodeRunStatus) {
        case 'PENDING':
            outlineColor = 'yellow'
            break
        case 'RUNNING':
            outlineColor = 'blue'
            break
        case 'COMPLETED':
            outlineColor = '#4CAF50'
            break
        case 'FAILED':
            outlineColor = 'red'
            break
        case 'CANCELED':
            outlineColor = 'gray'
            break
        default:
            if (status === 'completed') {
                outlineColor = '#4CAF50'
            }
    }

    const { backgroundColor, ...restStyle } = style || {}

    const cardStyle = React.useMemo(
        () => ({
            ...restStyle,
            outlineColor,
            outlineStyle: 'solid',
            outlineOffset: '0',
            transition: 'all 0.2s ease',
            pointerEvents: 'auto' as const,
        }),
        [restStyle, outlineColor]
    )

    const acronym = data?.acronym || 'N/A'
    const color = data?.color || '#ccc'

    const tagStyle = React.useMemo(
        () => ({
            ...staticStyles.baseTag,
            backgroundColor: color,
        }),
        [color]
    )

    const handleTitleChange = (newTitle: string) => {
        const validTitle = convertToPythonVariableName(newTitle)
        if (validTitle && validTitle !== getNodeTitle(data)) {
            dispatch(updateNodeTitle({ nodeId: id, newTitle: validTitle }))
        }
    }

    const headerStyle = React.useMemo(
        () => ({
            position: 'relative' as const,
            paddingTop: '8px',
            paddingBottom: isCollapsed ? '0px' : '16px',
        }),
        [isCollapsed]
    )

    const titleStyle = React.useMemo(
        () => ({
            marginBottom: isCollapsed ? '4px' : '8px',
        }),
        [isCollapsed]
    )

    const resizableClass = isResizable ? 'w-full h-full' : ''

    interface HandleRowProps {
        id: string
        keyName: string
    }

    const InputHandleRow: React.FC<HandleRowProps> = ({ id, keyName }) => {
        const connections = useNodeConnections({ id: id, handleType: 'target', handleId: keyName })
        const isConnectable = !isCollapsed && (connections.length === 0 || String(keyName).startsWith('branch'))
        return (
            <div className={`${styles.handleRow} w-full justify-end`} key={keyName} id={`input-${keyName}-row`}>
                <div className={`${styles.handleCell} ${styles.inputHandleCell}`} id={`input-${keyName}-handle`}>
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={String(id)}
                        className={`${styles.handle} ${styles.handleLeft} ${isCollapsed ? styles.collapsedHandleInput : ''}`}
                        isConnectable={isConnectable}
                    />
                </div>
                <div className="border-r border-gray-200 h-full mx-0" />
                {!isCollapsed && (
                    <div
                        className="align-center flex flex-grow flex-shrink ml-[0.5rem] max-w-full overflow-hidden"
                        id={`input-${keyName}-label`}
                    >
                        <span
                            className={`${styles.handleLabel} text-sm font-medium cursor-pointer hover:text-primary
                                mr-auto overflow-hidden text-ellipsis whitespace-nowrap`}
                        >
                            {String(keyName)}
                        </span>
                    </div>
                )}
            </div>
        )
    }

    const finalPredecessors = useMemo(() => {
        const updatedPredecessorNodes = edges
            .filter((edge) => edge.target === id)
            .map((edge) => {
                const sourceNode = nodes.find((node) => node.id === edge.source)
                if (!sourceNode) return null
                if (sourceNode.type === 'RouterNode' && edge.sourceHandle) {
                    return {
                        ...sourceNode,
                        handle_id: edge.sourceHandle,
                    }
                }
                return sourceNode
            })
            .filter(Boolean)

        let result = updatedPredecessorNodes

        if (connection.inProgress && connection.toNode && connection.toNode.id === id) {
            console.log('connection', connection)
            // Check if nodes have the same parent or both have no parent
            const fromNodeParentId = connection.fromNode?.parentId
            const toNodeParentId = connection.toNode?.parentId
            const canConnect =
                fromNodeParentId === toNodeParentId &&
                !isTargetAncestorOfSource(connection.fromNode.id, connection.toNode.id, nodes, edges)

            if (
                canConnect &&
                connection.fromNode &&
                !updatedPredecessorNodes.find((node: any) => node.id === connection.fromNode.id)
            ) {
                if (connection.fromNode.type === 'RouterNode' && connection.fromHandle) {
                    result = [
                        ...updatedPredecessorNodes,
                        {
                            id: connection.fromNode.id,
                            type: connection.fromNode.type,
                            handle_id: connection.fromHandle.id,
                            data: {
                                title: (connection.fromNode.data as { title?: string })?.title || connection.fromNode.id,
                            },
                        },
                    ]
                } else {
                    result = [
                        ...updatedPredecessorNodes,
                        {
                            id: connection.fromNode.id,
                            type: connection.fromNode.type,
                            data: {
                                title:
                                    (connection.fromNode.data as { title?: string })?.title || connection.fromNode.id,
                            },
                        },
                    ]
                }
            }
        }
        // deduplicate
        result = result.filter((node, index, self) => self.findIndex((n) => n.id === node.id) === index)
        return result
    }, [edges, nodes, connection, id])

    useEffect(() => {
        // Check if finalPredecessors differ from predecessorNodes
        // (We do a deeper comparison to detect config/title changes, not just ID changes)
        const hasChanged =
            finalPredecessors.length !== predecessorNodes.length ||
            finalPredecessors.some((newNode, i) => !isEqual(newNode, predecessorNodes[i]))

        if (hasChanged) {
            setPredecessorNodes(finalPredecessors)
            updateNodeInternals(id)
        }
    }, [finalPredecessors, predecessorNodes, updateNodeInternals, id])

    const renderHandles = () => {
        if (!nodeData) {
            return null
        }
        const dedupedPredecessors = finalPredecessors.filter(
            (node, index, self) => self.findIndex((n) => n.id === node.id) === index
        )

        return (
            <div className={`${styles.handlesWrapper}`} id="handles">
                {/* Input Handles */}
                <div className={`${styles.handlesColumn} ${styles.inputHandlesColumn}`} id="input-handles">
                    {dedupedPredecessors.map((node) => {
                        const handleId =
                        node.type === 'RouterNode' && node.handle_id
                            ? (node.data?.title + '.' + node.handle_id)
                            : String(node.data?.title || node.id || '')
                        // set node id for router node as node.id + node.data.title
                        const nodeId = node.type === 'RouterNode' ? node?.id + '.' + node?.handle_id : node?.id
                        return (
                            <InputHandleRow
                                key={`input-handle-row-${node.id}-${handleId}`}
                                id={nodeId}
                                keyName={handleId}
                            />
                        )
                    })}
                </div>

                {/* Output Handles */}
                {renderOutputHandles && renderOutputHandles()}
            </div>
        )
    }

    const nodeRef = useRef<HTMLDivElement | null>(null)

    const debouncedTitleChange = useMemo(
        () => debounce((newTitle: string) => {
            handleTitleChange(newTitle)
        }, 300),
        []
    )

    // Cleanup debounced function
    useEffect(() => {
        return () => {
            debouncedTitleChange.cancel()
        }
    }, [debouncedTitleChange])

    return (
        <>
            {alert.isVisible && (
                <div className="fixed bottom-4 right-4 z-50">
                    <Alert color={alert.color}>{alert.message}</Alert>
                </div>
            )}
            <div
                style={staticStyles.container}
                draggable={false}
                className={`group ${resizableClass}`}
                id={`node-${id}`}
            >
                <div className={resizableClass}>
                    {connection.inProgress && (
                        <Handle
                            key={`handle-${id}`}
                            type="target"
                            position={Position.Left}
                            id={`node-body-${id}`}
                            style={staticStyles.targetHandle}
                            isConnectable={true}
                            isConnectableStart={false}
                        />
                    )}

                    <div className={`react-flow__node-drag-handle ${resizableClass}`} style={staticStyles.dragHandle}>
                        <Card
                            key={`card-${id}`}
                            className={`base-node ${className || ''} ${resizableClass}`}
                            style={cardStyle}
                            classNames={{
                                base: `bg-background outline-default-200 ${
                                    isSelected
                                        ? 'outline-[3px]'
                                        : status === 'completed'
                                          ? 'outline-[2px]'
                                          : 'outline-[1px]'
                                } group-hover:outline-[3px]`,
                            }}
                        >
                            {data && (
                                <CardHeader key={`header-${id}`} style={headerStyle}>
                                    {editingTitle ? (
                                        <Input
                                            autoFocus
                                            value={titleInputValue}
                                            size="sm"
                                            variant="bordered"
                                            radius="lg"
                                            onChange={(e) => {
                                                const validValue = convertToPythonVariableName(e.target.value)
                                                setTitleInputValue(validValue)
                                                debouncedTitleChange(validValue)
                                            }}
                                            onBlur={() => setEditingTitle(false)}
                                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                                if (e.key === 'Enter' || e.key === 'Escape') {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    debouncedTitleChange.flush()
                                                    setEditingTitle(false)
                                                }
                                            }}
                                            classNames={{
                                                input: 'text-foreground dark:text-white',
                                                inputWrapper:
                                                    'dark:bg-default-100/50 bg-default-100/50 backdrop-blur-sm',
                                            }}
                                        />
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            {data.logo && (
                                                <img
                                                    src={`${PUBLIC_URL}` + data.logo}
                                                    alt="Node Logo"
                                                    className="mr-2 max-h-8 max-w-8 mb-3"
                                                />
                                            )}
                                            <h3
                                                className="text-lg font-semibold text-center cursor-pointer hover:text-primary transition-colors dark:text-white"
                                                style={titleStyle}
                                                onClick={() => {
                                                    setTitleInputValue(getNodeTitle(data))
                                                    setEditingTitle(true)
                                                }}
                                            >
                                                {getNodeTitle(data)}
                                            </h3>
                                        </div>
                                    )}

                                    <div style={staticStyles.controlsContainer}>
                                        <Button
                                            key={`collapse-btn-${id}`}
                                            size="sm"
                                            variant="flat"
                                            className="dark:bg-default-100/20 dark:border-default-700"
                                            style={staticStyles.collapseButton}
                                            onPress={() => {
                                                setIsCollapsed(!isCollapsed)
                                            }}
                                        >
                                            <Icon
                                                icon={
                                                    isCollapsed
                                                        ? 'solar:alt-arrow-down-linear'
                                                        : 'solar:alt-arrow-up-linear'
                                                }
                                                width={16}
                                                className="text-default-600 dark:text-default-400"
                                            />
                                        </Button>

                                        <div style={tagStyle} className="node-acronym-tag">
                                            {acronym}
                                        </div>
                                    </div>
                                </CardHeader>
                            )}
                            {!isCollapsed && <Divider key={`divider-${id}`} className="dark:bg-default-700" />}

                            <CardBody key={`body-${id}`} className="px-3 py-2">
                                <div className={styles.nodeWrapper} ref={nodeRef} id={`node-${id}-wrapper`}>
                                    {renderHandles()}
                                    </div>
                                {children}
                                {nodeData?.error && <NodeErrorDisplay error={nodeData?.error} />}
                                <NodeOutputDisplay key={`output-display-${id}`} output={nodeData?.run} />
                            </CardBody>
                        </Card>
                    </div>
                </div>

                <NodeControls
                    id={id}
                    isRunning={isRunning}
                    loading={loading}
                    isInputNode={isInputNode}
                    hasRun={data?.run !== undefined}
                    handlePartialRun={handlePartialRun}
                    handleDelete={handleDelete}
                    handleDuplicate={handleDuplicate}
                    handleOpenModal={handleOpenModal}
                    handleDetach={parentId ? handleDetach : undefined}
                />
            </div>
        </>
    )
}

export default BaseNode
