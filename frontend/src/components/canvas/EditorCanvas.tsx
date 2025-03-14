import { FlowWorkflowNodeType } from '@/store/nodeTypesSlice'
import { FlowWorkflowEdge, FlowWorkflowNode } from '@/types/api_types/nodeTypeSchemas'
import { WorkflowCreateRequest } from '@/types/api_types/workflowSchemas'
import { getLayoutedNodes } from '@/utils/nodeLayoutUtils'
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react'
import { Icon } from '@iconify/react'
import {
    Background,
    ConnectionMode,
    Edge,
    EdgeTypes,
    getNodesBounds,
    getViewportForBounds,
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
import React, { MouseEvent as ReactMouseEvent, useCallback, useEffect, useState } from 'react'
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
import HelperLinesRenderer from '../HelperLines'
import LoadingSpinner from '../LoadingSpinner'
import CollapsibleNodePanel from '../nodes/CollapsibleNodePanel'
import { onNodeDragOverGroupNode, onNodeDragStopOverGroupNode } from '../nodes/loops/groupNodeUtils'
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar'
import CustomEdge from './Edge'
import Operator from './footer/Operator'

interface EditorCanvasProps {
    workflowData?: WorkflowCreateRequest
    workflowID?: string
    onDownloadImageInit?: (handler: () => void) => void
    extraPanelButtons?: React.ReactNode
    renderNodeSidebarExternally?: boolean
}

interface HelperLines {
    horizontal: number | null
    vertical: number | null
}

interface CategoryGroup {
    nodes: FlowWorkflowNodeType[]
    logo?: string
    color?: string
    acronym?: string
}

interface GroupedNodes {
    [subcategory: string]: CategoryGroup
}

interface OperatorProps {
    handleLayout: () => void
    handleDownloadImage: () => void
}

const edgeTypes: EdgeTypes = {
    custom: CustomEdge,
}

const groupNodesBySubcategory = (nodes: FlowWorkflowNodeType[]): GroupedNodes => {
    return nodes.reduce((acc: GroupedNodes, node) => {
        const subcategory = node.category || 'Other'

        if (!acc[subcategory]) {
            acc[subcategory] = {
                nodes: [],
                logo: node.logo,
                color: node.visual_tag?.color,
                acronym: node.visual_tag?.acronym,
            }
        }
        acc[subcategory].nodes.push(node)
        return acc
    }, {})
}

// Create a wrapper component that includes ReactFlow logic
const EditorCanvasContent: React.FC<EditorCanvasProps> = ({
    workflowData,
    workflowID,
    onDownloadImageInit,
    extraPanelButtons,
    renderNodeSidebarExternally = false,
}) => {
    const dispatch = useDispatch()
    const projectName = useSelector((state: RootState) => state.flow.projectName)

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

    const nodes = useSelector((state: RootState) => state.flow.nodes, isEqual)
    const edges = useSelector((state: RootState) => state.flow.edges, isEqual)
    const nodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs, isEqual)
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
    const [expandedIntegrations, setExpandedIntegrations] = useState<Set<string>>(new Set())
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(['AI', 'Code Execution', 'Logic', 'Experimental', 'Integrations'])
    )

    const showHelperLines = false

    const mode = useModeStore((state) => state.mode)

    const { getIntersectingNodes, getNodes, updateNode, getViewport } = useReactFlow()

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

    const nodesWithAdjustedZIndex = useAdjustGroupNodesZIndex({ nodes: nodesWithMode })

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
            if (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
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
        [nodes, nodeTypesConfig, reactFlowInstance, dispatch, setPopoverContentVisible]
    )

    const onNodeDrag = useCallback(
        throttle((event: ReactMouseEvent, node: Node) => {
            onNodeDragOverGroupNode(event, node, nodes, dispatch, getIntersectingNodes, getNodes, updateNode)
        }, 16),
        [nodes, dispatch, getIntersectingNodes]
    )

    const onNodeDragStop = useCallback(
        (event: ReactMouseEvent, node: Node) => {
            onNodeDragStopOverGroupNode(event, node, nodes, edges, dispatch, getIntersectingNodes, getNodes, updateNode)
            onNodeDragStopThrottled(event, node)
        },
        [nodes, edges, dispatch, getIntersectingNodes, getNodes, updateNode, onNodeDragStopThrottled]
    )

    const toggleIntegration = (integration: string) => {
        setExpandedIntegrations((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(integration)) {
                newSet.delete(integration)
            } else {
                newSet.add(integration)
            }
            return newSet
        })
    }

    const toggleCategory = (category: string) => {
        setExpandedCategories((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(category)) {
                newSet.delete(category)
            } else {
                newSet.add(category)
            }
            return newSet
        })
    }

    const handleDownloadImage = useCallback(() => {
        const imageWidth = 1200
        const imageHeight = 675

        const nodes = getNodes()
        const nodesBounds = getNodesBounds(nodes)

        // Calculate the aspect ratio of the nodes' bounding box
        const boundsWidth = nodesBounds.width || 1
        const boundsHeight = nodesBounds.height || 1
        const boundsRatio = boundsWidth / boundsHeight
        const viewportRatio = imageWidth / imageHeight

        // Calculate optimal zoom based on both dimensions
        const zoomX = (imageWidth * 0.9) / boundsWidth
        const zoomY = (imageHeight * 0.9) / boundsHeight
        const optimalZoom = Math.min(zoomX, zoomY)

        const transform = getViewportForBounds(
            nodesBounds,
            imageWidth,
            imageHeight,
            optimalZoom,
            optimalZoom,
            Math.min(boundsWidth, boundsHeight) * 0.05 // Reduced padding from 10% to 5%
        )

        toPng(document.querySelector('.react-flow__viewport'), {
            backgroundColor: 'transparent',
            width: imageWidth,
            height: imageHeight,
            style: {
                width: `${imageWidth}px`,
                height: `${imageHeight}px`,
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
            },
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
    }, [getNodes, projectName])

    useEffect(() => {
        if (onDownloadImageInit) {
            onDownloadImageInit(handleDownloadImage)
        }
    }, [handleDownloadImage, onDownloadImageInit])

    if (isLoading) {
        return <LoadingSpinner />
    }

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            {isPopoverContentVisible && selectedEdge && (
                <div
                    style={{
                        position: 'absolute',
                        left: `${popoverPosition.x}px`,
                        top: `${popoverPosition.y}px`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1000,
                    }}
                >
                    <Dropdown
                        isOpen={isPopoverContentVisible}
                        onOpenChange={(isOpen) => {
                            if (!isOpen) {
                                setPopoverContentVisible(false)
                            }
                        }}
                        placement="bottom"
                    >
                        <DropdownTrigger>
                            <div></div>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Add node options"
                            closeOnSelect={false}
                            onAction={(key) => {
                                const keyStr = key.toString()
                                if (keyStr.startsWith('toggle-category-')) {
                                    toggleCategory(keyStr.replace('toggle-category-', ''))
                                    return
                                }
                                if (keyStr.startsWith('toggle-')) {
                                    toggleIntegration(keyStr.replace('toggle-', ''))
                                    return
                                }
                                handleAddNodeBetween(
                                    keyStr,
                                    selectedEdge.sourceNode,
                                    selectedEdge.targetNode,
                                    selectedEdge.edgeId
                                )
                                setPopoverContentVisible(false)
                            }}
                        >
                            {nodeTypesConfig &&
                                Object.keys(nodeTypesConfig)
                                    .filter((category) => category !== 'Input/Output')
                                    .map((category) => {
                                        const nodes = nodeTypesConfig[category]
                                        const hasSubcategories = nodes.some((node) => node.category)

                                        return (
                                            <React.Fragment key={category}>
                                                <DropdownItem
                                                    key={`toggle-category-${category}`}
                                                    className="font-bold opacity-70 flex items-center gap-2"
                                                    startContent={
                                                        <Icon
                                                            icon={
                                                                expandedCategories.has(category)
                                                                    ? 'solar:alt-arrow-down-linear'
                                                                    : 'solar:alt-arrow-right-linear'
                                                            }
                                                            className="text-default-500"
                                                        />
                                                    }
                                                >
                                                    {category}
                                                </DropdownItem>
                                                {expandedCategories.has(category) &&
                                                    (category === 'Integrations'
                                                        ? Object.entries(groupNodesBySubcategory(nodes)).map(
                                                              ([subcategory, { nodes: subcategoryNodes }]) => (
                                                                  <React.Fragment key={subcategory}>
                                                                      <DropdownItem
                                                                          key={`toggle-${subcategory}`}
                                                                          className="font-semibold pl-4 flex items-center gap-2"
                                                                          startContent={
                                                                              <Icon
                                                                                  icon={
                                                                                      expandedIntegrations.has(
                                                                                          subcategory
                                                                                      )
                                                                                          ? 'solar:alt-arrow-down-linear'
                                                                                          : 'solar:alt-arrow-right-linear'
                                                                                  }
                                                                                  className="text-default-500"
                                                                              />
                                                                          }
                                                                      >
                                                                          {subcategory}
                                                                      </DropdownItem>
                                                                      {expandedIntegrations.has(subcategory) &&
                                                                          subcategoryNodes.map((node) => (
                                                                              <DropdownItem
                                                                                  key={node.name}
                                                                                  className="pl-8"
                                                                                  startContent={
                                                                                      node.logo ? (
                                                                                          <img
                                                                                              src={node.logo}
                                                                                              alt={`${node.config.title} Logo`}
                                                                                              className="w-5 h-5"
                                                                                          />
                                                                                      ) : (
                                                                                          <div
                                                                                              className="node-acronym-tag text-white px-2 py-1 rounded-full text-xs"
                                                                                              style={{
                                                                                                  backgroundColor:
                                                                                                      node.visual_tag
                                                                                                          ?.color,
                                                                                              }}
                                                                                          >
                                                                                              {node.visual_tag?.acronym}
                                                                                          </div>
                                                                                      )
                                                                                  }
                                                                              >
                                                                                  {node.config.title}
                                                                              </DropdownItem>
                                                                          ))}
                                                                  </React.Fragment>
                                                              )
                                                          )
                                                        : hasSubcategories
                                                          ? Object.entries(groupNodesBySubcategory(nodes)).map(
                                                                ([subcategory, { nodes: subcategoryNodes }]) => (
                                                                    <React.Fragment key={subcategory}>
                                                                        <DropdownItem
                                                                            key={`${subcategory}-header`}
                                                                            className="font-semibold opacity-70 pl-4"
                                                                            isReadOnly
                                                                        >
                                                                            {subcategory}
                                                                        </DropdownItem>
                                                                        {subcategoryNodes.map((node) => (
                                                                            <DropdownItem
                                                                                key={node.name}
                                                                                className="pl-8"
                                                                                startContent={
                                                                                    node.logo ? (
                                                                                        <img
                                                                                            src={node.logo}
                                                                                            alt={`${node.config.title} Logo`}
                                                                                            className="w-5 h-5"
                                                                                        />
                                                                                    ) : (
                                                                                        <div
                                                                                            className="node-acronym-tag text-white px-2 py-1 rounded-full text-xs"
                                                                                            style={{
                                                                                                backgroundColor:
                                                                                                    node.visual_tag
                                                                                                        ?.color,
                                                                                            }}
                                                                                        >
                                                                                            {node.visual_tag?.acronym}
                                                                                        </div>
                                                                                    )
                                                                                }
                                                                            >
                                                                                {node.config.title}
                                                                            </DropdownItem>
                                                                        ))}
                                                                    </React.Fragment>
                                                                )
                                                            )
                                                          : nodes.map((node) => (
                                                                <DropdownItem
                                                                    key={node.name}
                                                                    className="pl-4"
                                                                    startContent={
                                                                        node.logo ? (
                                                                            <img
                                                                                src={node.logo}
                                                                                alt={`${node.config.title} Logo`}
                                                                                className="w-5 h-5"
                                                                            />
                                                                        ) : (
                                                                            <div
                                                                                className="node-acronym-tag text-white px-2 py-1 rounded-full text-xs"
                                                                                style={{
                                                                                    backgroundColor:
                                                                                        node.visual_tag?.color,
                                                                                }}
                                                                            >
                                                                                {node.visual_tag?.acronym}
                                                                            </div>
                                                                        )
                                                                    }
                                                                >
                                                                    {node.config.title}
                                                                </DropdownItem>
                                                            )))}
                                            </React.Fragment>
                                        )
                                    })}
                        </DropdownMenu>
                    </Dropdown>
                </div>
            )}

            <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                <div
                    style={{
                        height: '100%',
                        overflow: 'auto',
                        position: 'relative',
                        zIndex: 1,
                    }}
                >
                    <ReactFlow
                        nodes={nodesWithAdjustedZIndex}
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

                        {/* Extra Panel Buttons (from props) */}
                        {extraPanelButtons && <Panel position="top-right">{extraPanelButtons}</Panel>}
                    </ReactFlow>
                </div>
                {selectedNodeID && !renderNodeSidebarExternally && (
                    <div
                        className="absolute top-0 right-0 h-full bg-background dark:bg-background/80 border-l border-divider"
                        style={{ zIndex: 30 }}
                    >
                        <NodeSidebar nodeID={selectedNodeID} key={selectedNodeID} readOnly={false} />
                    </div>
                )}
                <div className="border-divider absolute top-4 left-4" style={{ zIndex: 15 }}>
                    <CollapsibleNodePanel />
                </div>
            </div>
        </div>
    )
}

// Main component that provides the ReactFlow context
const EditorCanvas: React.FC<EditorCanvasProps> = ({
    workflowData,
    workflowID,
    onDownloadImageInit,
    extraPanelButtons,
    renderNodeSidebarExternally = false,
}) => {
    return (
        <ReactFlowProvider>
            <EditorCanvasContent
                workflowData={workflowData}
                workflowID={workflowID}
                onDownloadImageInit={onDownloadImageInit}
                extraPanelButtons={extraPanelButtons}
                renderNodeSidebarExternally={renderNodeSidebarExternally}
            />
        </ReactFlowProvider>
    )
}

export default EditorCanvas
