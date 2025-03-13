import { FlowWorkflowNode } from '@/types/api_types/nodeTypeSchemas'
import { NodeProps } from '@xyflow/react'
import isEqual from 'lodash/isEqual'
import React, { useMemo, useState } from 'react'
import BaseNode from './BaseNode'
import styles from './DynamicNode.module.css'
import NodeOutputModal from './NodeOutputModal'
import { OutputHandleRow } from './shared/OutputHandleRow'

// Define a comparator for the memo
const dynamicNodeComparator = (prevProps: DynamicNodeProps, nextProps: DynamicNodeProps): boolean => {
    return (
        prevProps.id === nextProps.id &&
        prevProps.selected === nextProps.selected &&
        prevProps.zIndex === nextProps.zIndex &&
        prevProps.positionAbsoluteX === nextProps.positionAbsoluteX &&
        prevProps.positionAbsoluteY === nextProps.positionAbsoluteY &&
        isEqual(prevProps.data, nextProps.data)
    )
}

const baseNodeStyle = {
    width: 'auto',
    minWidth: '300px',
    maxWidth: '600px',
    height: 'auto',
    minHeight: '150px',
    maxHeight: '800px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    backdropFilter: 'blur(8px)',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
}

export interface DynamicNodeProps extends NodeProps<FlowWorkflowNode> {
    displayOutput?: boolean
    readOnly?: boolean
    displaySubflow?: boolean
    displayResizer?: boolean
}

const DynamicNode: React.FC<DynamicNodeProps> = ({
    id,
    data,
    dragHandle,
    type,
    selected,
    isConnectable,
    zIndex,
    positionAbsoluteX,
    positionAbsoluteY,
    displayOutput,
    ...props
}) => {
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

    const nodeData = data

    // Memoize the output handles rendering
    const renderOutputHandles = useMemo(() => {
        const OutputHandlesComponent = () => (
            <div className={`${styles.handlesColumn} ${styles.outputHandlesColumn}`} id="output-handle">
                {nodeData?.title && (
                    <OutputHandleRow id={id} keyName={String(nodeData?.title)} isCollapsed={isCollapsed} />
                )}
            </div>
        )
        OutputHandlesComponent.displayName = 'OutputHandlesComponent'
        return OutputHandlesComponent
    }, [id, nodeData?.title, isCollapsed])

    return (
        <>
            <div className={styles.dynamicNodeWrapper} style={{ zIndex: props.parentId ? 1 : 0 }}>
                <BaseNode
                    id={id}
                    data={nodeData}
                    style={baseNodeStyle}
                    isCollapsed={isCollapsed}
                    setIsCollapsed={setIsCollapsed}
                    handleOpenModal={setIsModalOpen}
                    className="hover:!bg-background"
                    positionAbsoluteX={positionAbsoluteX}
                    positionAbsoluteY={positionAbsoluteY}
                    renderOutputHandles={renderOutputHandles}
                    {...props}
                ></BaseNode>
            </div>
            <NodeOutputModal
                isOpen={isModalOpen}
                onOpenChange={setIsModalOpen}
                title={nodeData?.title || 'Node Output'}
                data={nodeData}
            />
        </>
    )
}

// Add display name to the original component
DynamicNode.displayName = 'DynamicNode'

// Create memoized component
const MemoizedDynamicNode = React.memo(DynamicNode, dynamicNodeComparator)

// Add display name to memoized component
MemoizedDynamicNode.displayName = 'MemoizedDynamicNode'

export default MemoizedDynamicNode
