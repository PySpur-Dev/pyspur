import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Handle, NodeProps, Position, useConnection } from '@xyflow/react'
import BaseNode from '../BaseNode'
import { Input, Card, Divider, Button, Select, SelectItem } from '@heroui/react'
import { useDispatch, useSelector } from 'react-redux'
import { updateNodeConfigOnly } from '../../../store/flowSlice'
import styles from '../DynamicNode.module.css'
import { Icon } from '@iconify/react'
import { RootState } from '../../../store/store'
import isEqual from 'lodash/isEqual'
import { FlowWorkflowNode } from '@/types/api_types/nodeTypeSchemas'
import NodeOutputModal from '../NodeOutputModal'
import { OutputHandleRow } from '../shared/OutputHandleRow'
import DynamicNode from '../DynamicNode'

export interface CoalesceNodeProps extends NodeProps<FlowWorkflowNode> {
    displayOutput?: boolean
    readOnly?: boolean
    displaySubflow?: boolean
    displayResizer?: boolean
}

/**
 * A node that displays multiple input handles (one for each upstream node),
 * and a preference list allowing the user to pick fields in a certain priority order.
 */
export const CoalesceNode: React.FC<CoalesceNodeProps> = ({ id, data }) => {
    const [isCollapsed, setIsCollapsed] = useState(false)
    const nodeRef = useRef<HTMLDivElement | null>(null)

    // We'll dynamically compute a width that fits the labels (handles).
    const [nodeWidth, setNodeWidth] = useState<string>('auto')

    const dispatch = useDispatch()
    const connection = useConnection()

    // Retrieve all nodes & edges from Redux so we can figure out which are predecessors
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const edges = useSelector((state: RootState) => state.flow.edges)

    const [isModalOpen, setIsModalOpen] = useState(false)

    // Node's output for display
    const nodeOutput = useSelector((state: RootState) => state.flow.nodes.find((node) => node.id === id)?.data?.run)

    // Node's config
    const nodeConfig = useSelector((state: RootState) => state.flow.nodeConfigs[id])
    // console.log('nodeConfig', nodeConfig)

    // The CoalesceNode might have multiple incoming edges. We'll track those predecessor nodes (if any).
    const [predecessorNodes, setPredecessorNodes] = useState(() => {
        return edges
            .filter((edge) => edge.target === id)
            .map((edge) => {
                const sourceNode = nodes.find((node) => node.id === edge.source)
                if (!sourceNode) return null
                return sourceNode
            })
            .filter(Boolean)
    })

    // Add a type guard to check if the node is a FlowWorkflowNode
    const isFlowWorkflowNode = (node: any): node is FlowWorkflowNode => {
        return 'type' in node
    }

    // Recompute predecessor nodes whenever edges/connections change
    useEffect(() => {
        const updatedPredecessors = edges
            .filter((edge) => edge.target === id)
            .map((edge) => {
                const sourceNode = nodes.find((node) => node.id === edge.source)
                if (!sourceNode) return null
                return sourceNode
            })
            .filter(Boolean)

        let finalPredecessors = updatedPredecessors

        // If a new connection is in progress to this node, show that source node as well

        // Deduplicate by both id and data.title (for RouterNode handles)
        finalPredecessors = finalPredecessors.filter((node, index, self) => {
            return self.findIndex((n) => n?.id === node?.id && n?.data?.title === node?.data?.title) === index
        })

        // Compare to existing predecessorNodes; only set if changed
        const hasChanged =
            finalPredecessors.length !== predecessorNodes.length ||
            finalPredecessors.some((node, i) => !isEqual(node, predecessorNodes[i]))
        if (hasChanged) {
            setPredecessorNodes(finalPredecessors)
        }
    }, [connection, edges, id, nodes, predecessorNodes])

    /**
     * Build an array of upstream node IDs for the dropdown.
     * (We're not currently using the node's output_schema to filter the keys.)
     */
    const inputVariables = useMemo(() => {
        return predecessorNodes
            .map((pred) => {
                if (!pred) return null
                const nodeId = pred.id
                const handleId = pred.data?.title || ''
                const label = pred.data?.config?.title || handleId || pred.id
                const value = `${nodeId}|${handleId}`
                return {
                    value,
                    label,
                }
            })
            .filter(Boolean) as { value: string; label: string }[]
    }, [predecessorNodes])

    /**
     * Keep track of used variable preferences so we don't show duplicates in other slots.
     */
    const usedPreferences = nodeConfig?.preferences?.filter(Boolean)
    const availableVariablesForIndex = (index: number) => {
        return inputVariables.filter(
            (v) => !usedPreferences.includes(v.value) || v.value === nodeConfig.preferences[index]
        )
    }

    /** A helper to update the node's preference array in Redux */
    const updatePreferences = (newPreferences: string[]) => {
        dispatch(
            updateNodeConfigOnly({
                id,
                data: {
                    preferences: newPreferences,
                },
            })
        )
    }

    // Keep preference array in sync with number of input variables
    useEffect(() => {
        const desiredLength = inputVariables.length
        let updated = [...nodeConfig.preferences]

        if (updated.length > desiredLength) {
            updated = updated.slice(0, desiredLength)
        } else if (updated.length < desiredLength) {
            while (updated.length < desiredLength) {
                updated.push('')
            }
        }

        const changed =
            updated.length !== nodeConfig.preferences.length ||
            updated.some((val, i) => val !== nodeConfig.preferences[i])

        if (changed) {
            updatePreferences(updated)
        }
    }, [inputVariables])

    /** Update preference index i to a new variable name  */
    const handlePreferenceChange = (index: number, value: string) => {
        const updated = [...nodeConfig.preferences]
        updated[index] = value
        updatePreferences(updated)
    }

    /** Clear the preference at index i */
    const clearPreference = (index: number) => {
        const updated = [...nodeConfig.preferences]
        updated[index] = ''
        updatePreferences(updated)
    }

    /**
     *  Measure the lengths of input handle labels + output label
     *  and set an appropriate nodeWidth so that names are fully visible.
     */
    useEffect(() => {
        if (!nodeRef.current) return

        // We have multiple input handle labels
        const inputLabels = predecessorNodes.map(
            (pred) => pred?.data?.config?.title || pred?.data?.title || pred?.id || ''
        )

        // Output label is the node's title or fallback
        const outputLabels = [nodeConfig?.title || 'Coalesce']

        // Compute the max length among all input labels
        const maxInputLabelLength = inputLabels.reduce((max, label) => Math.max(max, label.length), 0)
        // Compute the max length among all output labels
        const maxOutputLabelLength = outputLabels.reduce((max, label) => Math.max(max, label.length), 0)

        // The node's own title (for the top of the node)
        const nodeTitle = nodeConfig?.title || 'Coalesce'
        const nodeTitleLength = nodeTitle.length

        // Some extra spacing
        const buffer = 5

        // Rough estimate: multiply the longest label length by ~10 for width in px.
        const minNodeWidth = 300
        const maxNodeWidth = 600

        const estimatedWidth = Math.max(
            (maxInputLabelLength + maxOutputLabelLength + buffer) * 10,
            nodeTitleLength * 10,
            minNodeWidth
        )
        const finalWidth = Math.min(estimatedWidth, maxNodeWidth)

        // If collapsed, show auto; otherwise the computed width
        if (nodeWidth !== `${finalWidth}px`) {
            setNodeWidth(isCollapsed ? 'auto' : `${finalWidth}px`)
        }
    }, [predecessorNodes, nodeConfig?.title, isCollapsed])

    const nodeData = {
        title: nodeConfig?.title || 'Coalesce',
        color: data.color || '#38B2AC',
        acronym: 'CL',
        run: data.run,
        config: nodeConfig,
        taskStatus: data.taskStatus,
    }

    const renderOutputHandles = () => {
        return (
            <div className={`${styles.handlesColumn} ${styles.outputHandlesColumn}`} id="output-handle">
                {nodeData?.title && <OutputHandleRow id={id} keyName={String(nodeData?.title)} isCollapsed={isCollapsed} />}
            </div>
        )
    }

    return (
        <BaseNode
            id={id}
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
            data={nodeData}
            // Update style to include max-height and flex properties
            style={{ width: nodeWidth, maxHeight: '800px', display: 'flex', flexDirection: 'column' }}
            className="hover:!bg-background"
            renderOutputHandles={renderOutputHandles}
            handleOpenModal={setIsModalOpen}
        >
            <div className="flex flex-col flex-grow overflow-hidden" ref={nodeRef}>
                {/* The main body, hidden if collapsed */}
                {!isCollapsed && (
                    <div
                        className="p-3 overflow-y-auto"
                        style={{ touchAction: 'none', maxHeight: '600px' }}
                        onWheelCapture={(e) => {
                            e.stopPropagation()
                        }}
                    >
                        {/* Preferences Header - Now sticky */}
                        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 pb-4">
                            <Divider className="my-2" />
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-sm font-medium text-foreground">Preferences</span>
                                <Divider className="flex-grow" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            {nodeConfig?.preferences?.map((prefValue, i) => (
                                <Card key={i} classNames={{ base: 'bg-background border-default-200 p-2' }}>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Select
                                            aria-label="Select variable"
                                            size="sm"
                                            selectedKeys={prefValue ? [prefValue] : []}
                                            placeholder="Select variable"
                                            onChange={(e) => handlePreferenceChange(i, e.target.value)}
                                            className="min-w-[200px]"
                                            classNames={{
                                                trigger: 'bg-default-100 dark:bg-default-50 min-h-unit-12 h-auto',
                                                popoverContent: 'bg-background dark:bg-background',
                                            }}
                                            isMultiline
                                        >
                                            {availableVariablesForIndex(i).map((variable) => (
                                                <SelectItem
                                                    key={variable.value}
                                                    value={variable.value}
                                                    textValue={variable.label}
                                                >
                                                    <div className="whitespace-normal">
                                                        <span>{variable.label}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </Select>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <NodeOutputModal
                isOpen={isModalOpen}
                onOpenChange={setIsModalOpen}
                title={nodeData?.title || 'Node Output'}
                data={nodeData}
            />
        </BaseNode>
    )
}
