import { FlowWorkflowEdge, FlowWorkflowNode } from '@/types/api_types/nodeTypeSchemas'
import { WorkflowCreateRequest } from '@/types/api_types/workflowSchemas'
import { getLayoutedNodes } from '@/utils/nodeLayoutUtils'
import { Button, Tooltip } from '@heroui/react'
import { Icon } from '@iconify/react'
import {
    Background,
    ConnectionMode,
    Edge,
    EdgeTypes,
    Node,
    Panel,
    ReactFlow,
    ReactFlowInstance,
    ReactFlowProvider,
    SelectionMode,
    useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { throttle } from 'lodash'
import isEqual from 'lodash/isEqual'
import React, { MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState, memo, useMemo, useDeferredValue } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow'
import { deleteNode, initializeFlow, setNodes, setSelectedEdgeId, setSelectedNode } from '../../store/flowSlice'
import { useModeStore } from '../../store/modeStore'
import { setNodePanelExpanded } from '../../store/panelSlice'
import { RootState } from '../../store/store'
import {
    insertNodeBetweenNodes,
    useAdjustGroupNodesZIndex,
    useFlowEventHandlers,
    useNodesWithMode,
    useNodeTypes,
    useStyledEdges,
} from '../../utils/flowUtils'
import useCopyPaste from '../../utils/useCopyPaste'
import Chat from '../chat/Chat'
import HelperLinesRenderer from '../HelperLines'
import LoadingSpinner from '../LoadingSpinner'
import CollapsibleNodePanel from '../nodes/CollapsibleNodePanel'
import { onNodeDragOverGroupNode, onNodeDragStopOverGroupNode } from '../nodes/loops/groupNodeUtils'
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar'
import CustomEdge from './Edge'
import Operator from './footer/Operator'

interface ChatCanvasProps {
    workflowData?: WorkflowCreateRequest
    workflowID?: string
    onDownloadImageInit?: (handler: () => void) => void
}

interface HelperLines {
    horizontal: number | null
    vertical: number | null
}

const edgeTypes: EdgeTypes = {
    custom: CustomEdge,
}

// Add this memoized component at the top of the file
const MemoizedReactFlow = memo(ReactFlow, (prevProps, nextProps) => {
    // Custom comparison focusing on the most important props
    if (prevProps.nodes.length !== nextProps.nodes.length) return false;
    if (prevProps.edges.length !== nextProps.edges.length) return false;

    // We don't need deep comparison for all properties of nodes and edges
    // Just check if the references changed, which is what we control with our memoization
    return (
        prevProps.nodes === nextProps.nodes &&
        prevProps.edges === nextProps.edges
    );
});

// Create a wrapper component that includes ReactFlow logic
const ChatCanvasContent: React.FC<ChatCanvasProps> = ({ workflowData, workflowID, onDownloadImageInit }) => {
    const dispatch = useDispatch()
    const projectName = useSelector((state: RootState) => state.flow.projectName)

    // Resize control state
    const [chatWidth, setChatWidth] = useState(400) // Default chat panel width
    const [isResizing, setIsResizing] = useState(false)
    const [showChat, setShowChat] = useState(true)
    const containerRef = useRef<HTMLDivElement>(null)

    const nodeTypesConfig = useSelector((state: RootState) => state.nodeTypes.data)

    const { nodeTypes, isLoading } = useNodeTypes({
        nodeTypesConfig,
        readOnly: false,
        includeCoalesceNode: true,
    })

    useEffect(() => {
        if (workflowData) {
            dispatch(
                initializeFlow({
                    nodeTypes: nodeTypesConfig,
                    definition: workflowData.definition,
                    workflowID: workflowID,
                    name: workflowData.name,
                })
            )
        }
    }, [dispatch, workflowData, workflowID, nodeTypesConfig])

    // Use more efficient selector comparison for nodes and edges
    const nodes = useSelector((state: RootState) => state.flow.nodes,
        (prev, next) => prev.length === next.length && prev === next
    )
    const edges = useSelector((state: RootState) => state.flow.edges,
        (prev, next) => prev.length === next.length && prev === next
    )
    const nodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs,
        (prev, next) => prev === next
    )
    const selectedNodeID = useSelector((state: RootState) => state.flow.selectedNode)
    const selectedEdgeId = useSelector((state: RootState) => state.flow.selectedEdgeId)

    const saveWorkflow = useSaveWorkflow()

    useEffect(() => {
        if (nodes.length > 0 || edges.length > 0 || Object.keys(nodeConfigs).length > 0) {
            saveWorkflow()
        }
    }, [nodes, edges, nodeConfigs, saveWorkflow])

    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
    const [helperLines, setHelperLines] = useState<HelperLines>({
        horizontal: null,
        vertical: null,
    })
    const [hoveredNode, setHoveredNode] = useState<string | null>(null)
    const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
    const [isPopoverContentVisible, setPopoverContentVisible] = useState(false)
    const [selectedEdge, setSelectedEdge] = useState<{
        sourceNode: FlowWorkflowNode
        targetNode: FlowWorkflowNode
        edgeId: string
    } | null>(null)
    const [popoverPosition, setPopoverPosition] = useState<{
        x: number
        y: number
    }>({ x: 0, y: 0 })

    const showHelperLines = false

    const mode = useModeStore((state) => state.mode)

    const { getIntersectingNodes, getNodes, updateNode } = useReactFlow()

    const handlePopoverOpen = useCallback(
        ({
            sourceNode,
            targetNode,
            edgeId,
        }: {
            sourceNode: FlowWorkflowNode
            targetNode: FlowWorkflowNode
            edgeId: string
        }) => {
            if (!reactFlowInstance) return

            const centerX = (sourceNode.position.x + targetNode.position.x) / 2
            const centerY = (sourceNode.position.y + targetNode.position.y) / 2

            const screenPos = reactFlowInstance.flowToScreenPosition({
                x: centerX,
                y: centerY,
            })

            setPopoverPosition({
                x: screenPos.x,
                y: screenPos.y,
            })
            setSelectedEdge({ sourceNode, targetNode, edgeId })
            setPopoverContentVisible(true)
        },
        [reactFlowInstance]
    )

    const {
        onNodesChange,
        onEdgesChange,
        onConnect,
        onNodeDragStop: onNodeDragStopThrottled,
    } = useFlowEventHandlers({
        dispatch,
        nodes,
        setHelperLines,
    })

    const styledEdges = useStyledEdges({
        edges,
        hoveredNode,
        hoveredEdge,
        selectedEdgeId,
        handlePopoverOpen,
    })

    const nodesWithMode = useNodesWithMode({
        nodes,
        mode: mode as 'pointer' | 'hand',
    })

    const nodesWithAdjustedZIndex = useMemo(() => {
        let groupNodeZIndex = -1
        return nodesWithMode.map((node) => {
            if (node.type === 'ForLoopNode') {
                return {
                    ...node,
                    style: {
                        ...node.style,
                        zIndex: groupNodeZIndex,
                    },
                }
            }
            return node
        });
    }, [nodesWithMode])

    const onEdgeMouseEnter = useCallback(
        (_: React.MouseEvent, edge: Edge) => {
            setHoveredEdge(edge.id)
        },
        [setHoveredEdge]
    )

    const onEdgeMouseLeave = useCallback(() => {
        setHoveredEdge(null)
    }, [setHoveredEdge])

    const onInit = useCallback((instance: ReactFlowInstance) => {
        setReactFlowInstance(instance)
        instance.setViewport({ x: 0, y: 0, zoom: 0.8 })
    }, [])

    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: FlowWorkflowNode) => {
            dispatch(setSelectedNode({ nodeId: node.id }))
        },
        [dispatch]
    )

    const onEdgeClick = useCallback(
        (_event: React.MouseEvent, edge: Edge) => {
            dispatch(setSelectedEdgeId({ edgeId: edge.id }))
        },
        [dispatch]
    )

    const onPaneClick = useCallback(() => {
        if (selectedNodeID) {
            dispatch(setSelectedNode({ nodeId: null }))
        }
        if (selectedEdgeId) {
            dispatch(setSelectedEdgeId({ edgeId: null }))
        }
        dispatch(setNodePanelExpanded(false))
    }, [dispatch, selectedNodeID, selectedEdgeId])

    const onNodesDelete = useCallback(
        (deletedNodes: FlowWorkflowNode[]) => {
            deletedNodes.forEach((node) => {
                dispatch(deleteNode({ nodeId: node.id }))

                if (selectedNodeID === node.id) {
                    dispatch(setSelectedNode({ nodeId: null }))
                }
            })
        },
        [dispatch, selectedNodeID]
    )

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const target = event.target as HTMLElement
            const tagName = target.tagName.toLowerCase()

            // Don't intercept keyboard events when typing in the chat
            if (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
                return
            }

            // Don't handle keyboard events if we're focused in the chat panel
            const chatPanelElement = document.querySelector(
                '.h-full.bg-background.dark\\:bg-background\\/80.border-l.border-divider'
            )
            if (chatPanelElement?.contains(document.activeElement)) {
                return
            }

            // Get the node panel state
            const nodePanelElement = document.querySelector('[data-node-panel]')
            const isNodePanelExpanded = nodePanelElement?.getAttribute('data-expanded') === 'true'
            const isNodePanelFocused = nodePanelElement?.contains(document.activeElement)

            // Only handle delete/backspace regardless of panel state
            if (event.key === 'Delete' || event.key === 'Backspace') {
                const selectedNodes = nodes.filter((node) => node.selected)
                if (selectedNodes.length > 0) {
                    onNodesDelete(selectedNodes)
                }
                return
            }

            // Don't handle arrow keys if node panel is expanded and focused
            if (isNodePanelExpanded && isNodePanelFocused) {
                return
            }

            // Pan amount per keypress (adjust this value to control pan speed)
            const BASE_PAN_AMOUNT = 15
            const PAN_AMOUNT = event.shiftKey ? BASE_PAN_AMOUNT * 3 : BASE_PAN_AMOUNT

            if (reactFlowInstance) {
                const { x, y, zoom } = reactFlowInstance.getViewport()

                switch (event.key) {
                    case 'ArrowLeft':
                        reactFlowInstance.setViewport({ x: x + PAN_AMOUNT, y, zoom })
                        break
                    case 'ArrowRight':
                        reactFlowInstance.setViewport({ x: x - PAN_AMOUNT, y, zoom })
                        break
                    case 'ArrowUp':
                        reactFlowInstance.setViewport({ x, y: y + PAN_AMOUNT, zoom })
                        break
                    case 'ArrowDown':
                        reactFlowInstance.setViewport({ x, y: y - PAN_AMOUNT, zoom })
                        break
                }
            }
        },
        [nodes, onNodesDelete, reactFlowInstance]
    )

    const handleLayout = useCallback(() => {
        const layoutedNodes = getLayoutedNodes(nodes as FlowWorkflowNode[], edges as FlowWorkflowEdge[])
        dispatch(setNodes({ nodes: layoutedNodes }))
    }, [nodes, edges, dispatch])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [handleKeyDown])

    useKeyboardShortcuts(selectedNodeID, nodes, nodeTypes, nodeTypesConfig, dispatch, handleLayout)

    const { cut, copy, paste, bufferedNodes } = useCopyPaste()
    useCopyPaste()

    const proOptions = {
        hideAttribution: true,
    }

    const onNodeMouseEnter = useCallback(
        (_: React.MouseEvent, node: FlowWorkflowNode) => {
            setHoveredNode(node.id)
        },
        [setHoveredNode]
    )

    const onNodeMouseLeave = useCallback(() => {
        setHoveredNode(null)
    }, [setHoveredNode])

    const handleAddNodeBetween = useCallback(
        (nodeName: string, sourceNode: FlowWorkflowNode, targetNode: FlowWorkflowNode, edgeId: string) => {
            insertNodeBetweenNodes(nodes, nodeTypesConfig, nodeName, sourceNode, targetNode, edgeId, dispatch, () =>
                setPopoverContentVisible(false)
            )
        },
        [nodes, nodeTypesConfig, dispatch, setPopoverContentVisible]
    )

    // Add a dragging mode state
    const [isDragging, setIsDragging] = useState(false);

    const onNodeDrag = useCallback(
        throttle((event: ReactMouseEvent, node: Node) => {
            // During drag, only do minimal position updates without expensive calculations
            // Skip group node intersection checks during dragging for better performance
            setIsDragging(true);

            // Skip complex group node calculations during drag
            // Just update position visually without triggering Redux updates
            if (node.parentId) {
                // Only handle parent nodes differently during drag
                return;
            }
        }, 48), // Increase throttle time for better performance
        [setIsDragging]
    );

    const onNodeDragStop = useCallback(
        (event: ReactMouseEvent, node: Node) => {
            // Process expensive calculations only when node drag stops
            setIsDragging(false);

            // Now perform full group node intersection check
            onNodeDragStopOverGroupNode(event, node, nodes, edges, dispatch, getIntersectingNodes, getNodes, updateNode);
            onNodeDragStopThrottled(event, node);
        },
        [nodes, edges, dispatch, getIntersectingNodes, getNodes, updateNode, onNodeDragStopThrottled]
    );

    const handleDownloadImage = useCallback(() => {
        const flowContainer = document.querySelector('.react-flow__viewport') as HTMLElement
        if (!flowContainer) return

        toPng(flowContainer, {
            backgroundColor: 'transparent',
            width: flowContainer.clientWidth,
            height: flowContainer.clientHeight,
        })
            .then((dataUrl) => {
                const a = document.createElement('a')
                a.href = dataUrl
                a.download = `${projectName}.png`
                a.click()
            })
            .catch((err) => {
                console.error('Failed to download image', err)
            })
    }, [projectName])

    useEffect(() => {
        if (onDownloadImageInit) {
            onDownloadImageInit(handleDownloadImage)
        }
    }, [handleDownloadImage, onDownloadImageInit])

    // Handle resizing of chat panel
    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true)
        e.preventDefault()
    }, [])

    const stopResizing = useCallback(() => {
        setIsResizing(false)
    }, [])

    const resize = useCallback(
        (e: MouseEvent) => {
            if (isResizing && containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect()
                const newWidth = containerRect.right - e.clientX

                // Set minimum and maximum width constraints
                if (newWidth > 200 && newWidth < containerRect.width * 0.8) {
                    setChatWidth(newWidth)
                }
            }
        },
        [isResizing]
    )

    useEffect(() => {
        window.addEventListener('mousemove', resize)
        window.addEventListener('mouseup', stopResizing)

        return () => {
            window.removeEventListener('mousemove', resize)
            window.removeEventListener('mouseup', stopResizing)
        }
    }, [resize, stopResizing])

    const toggleChatPanel = () => {
        setShowChat((prev) => !prev)
    }

    // Use deferred values for nodes with adjusted z-index to optimize rendering during drags
    const deferredNodes = useDeferredValue(nodesWithAdjustedZIndex);

    if (isLoading) {
        return <LoadingSpinner />
    }

    return (
        <div
            ref={containerRef}
            className="relative flex h-full w-full overflow-hidden bg-background dark:bg-background"
            style={{ cursor: isResizing ? 'col-resize' : 'default' }}
        >
            {/* React Flow Canvas */}
            <div className="flex-grow relative h-full overflow-hidden">
                <MemoizedReactFlow
                    nodes={isDragging ? deferredNodes : nodesWithAdjustedZIndex}
                    edges={styledEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    onInit={onInit}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={onPaneClick}
                    onNodesDelete={onNodesDelete}
                    proOptions={proOptions}
                    panOnDrag={mode === 'hand' && !nodes.filter(Boolean).some((n) => n.selected)}
                    panOnScroll={true}
                    zoomOnScroll={true}
                    minZoom={0.1}
                    maxZoom={2}
                    selectionMode={mode === 'pointer' ? SelectionMode.Full : SelectionMode.Partial}
                    selectNodesOnDrag={mode === 'pointer'}
                    selectionOnDrag={mode === 'pointer'}
                    selectionKeyCode={mode === 'pointer' ? null : 'Shift'}
                    multiSelectionKeyCode={mode === 'pointer' ? null : 'Shift'}
                    deleteKeyCode="Delete"
                    nodesConnectable={true}
                    connectionMode={ConnectionMode.Loose}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onEdgeMouseEnter={onEdgeMouseEnter}
                    onEdgeMouseLeave={onEdgeMouseLeave}
                    snapToGrid={false}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                >
                    <Background />
                    {showHelperLines && (
                        <HelperLinesRenderer horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
                    )}
                    <Operator handleLayout={handleLayout} handleDownloadImage={handleDownloadImage} />

                    {/* Toggle Chat Panel Button */}
                    <Panel position="top-right">
                        <Tooltip content={showChat ? 'Hide Chat' : 'Show Chat'}>
                            <Button
                                isIconOnly
                                variant="flat"
                                size="sm"
                                onPress={toggleChatPanel}
                                aria-label={showChat ? 'Hide Chat' : 'Show Chat'}
                            >
                                <Icon
                                    icon={showChat ? 'lucide:panel-right-close' : 'lucide:panel-right-open'}
                                    width={20}
                                />
                            </Button>
                        </Tooltip>
                    </Panel>
                </MemoizedReactFlow>

                {/* Node Sidebar */}
                {selectedNodeID && (
                    <div
                        className="absolute top-0 right-0 h-full bg-background dark:bg-background/80 border-l border-divider"
                        style={{ zIndex: 10 }}
                    >
                        <NodeSidebar nodeID={selectedNodeID} key={selectedNodeID} readOnly={false} />
                    </div>
                )}

                {/* Node Panel */}
                <div className="border-divider absolute top-4 left-4" style={{ zIndex: 2 }}>
                    <CollapsibleNodePanel />
                </div>
            </div>

            {/* Memoized Chat Panel - only re-renders when props change */}
            {showChat && <ChatPanel workflowID={workflowID} width={chatWidth} onResizeStart={startResizing} />}
        </div>
    )
}

// Main component that provides the ReactFlow context
const ChatCanvas: React.FC<ChatCanvasProps> = ({ workflowData, workflowID, onDownloadImageInit }) => {
    return (
        <ReactFlowProvider>
            <ChatCanvasContent
                workflowData={workflowData}
                workflowID={workflowID}
                onDownloadImageInit={onDownloadImageInit}
            />
        </ReactFlowProvider>
    )
}

// Memoized ChatPanel component to prevent re-renders when ReactFlow changes
const ChatPanel = React.memo(
    ({
        workflowID,
        width,
        onResizeStart,
    }: {
        workflowID?: string
        width: number
        onResizeStart: (e: React.MouseEvent) => void
    }) => {
        return (
            <>
                {/* Chat Panel Resizer */}
                <div
                    className="w-1 bg-border hover:bg-primary cursor-col-resize h-[calc(100vh-48px)] relative z-5"
                    onMouseDown={onResizeStart}
                />

                {/* Chat Panel */}
                <div
                    className="h-[calc(100vh-48px)] bg-background dark:bg-background/80 border-l border-divider overflow-hidden flex flex-col"
                    style={{ width: `${width}px`, zIndex: 5 }}
                >
                    <div className="w-full h-full overflow-hidden">
                        <Chat workflowID={workflowID} />
                    </div>
                </div>
            </>
        )
    }
)

// Add display name for debugging
ChatPanel.displayName = 'ChatPanel'

export default ChatCanvas
