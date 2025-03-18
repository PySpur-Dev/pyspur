import { Accordion, AccordionItem, Button, Input, Tooltip } from '@heroui/react'
import { Icon } from '@iconify/react'
import { useReactFlow } from '@xyflow/react'
import React, { useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useDispatch, useSelector } from 'react-redux'

import type { FlowWorkflowNodeType, FlowWorkflowNodeTypesByCategory } from '../../store/nodeTypesSlice'
import { setNodePanelExpanded } from '../../store/panelSlice'
import { RootState } from '../../store/store'
import { createNodeAtCenter } from '../../utils/flowUtils'

interface CategoryGroup {
    nodes: FlowWorkflowNodeType[]
    logo?: string
    color?: string
    acronym?: string
}

interface GroupedNodes {
    [subcategory: string]: CategoryGroup
}

interface CollapsibleNodePanelProps {
    handleAddNode?: (nodeName: string) => void
    isCustomAdd?: boolean
    controlledExpanded?: boolean
    onExpandedChange?: (expanded: boolean) => void
}

const CollapsibleNodePanel: React.FC<CollapsibleNodePanelProps> = ({
    handleAddNode,
    isCustomAdd = false,
    controlledExpanded,
    onExpandedChange,
}) => {
    const isExpanded = useSelector((state: RootState) => state.panel.isNodePanelExpanded)
    const dispatch = useDispatch()
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const nodeTypes = useSelector((state: RootState) => state.nodeTypes.data as FlowWorkflowNodeTypesByCategory)
    const reactFlowInstance = useReactFlow()
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<Set<string>>(new Set())
    const [filteredNodeTypes, setFilteredNodeTypes] = useState<FlowWorkflowNodeTypesByCategory>({})
    const searchInputRef = useRef<HTMLInputElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const [selectedNodeIndex, setSelectedNodeIndex] = useState<number>(-1)

    // Use controlled expansion state if provided, otherwise use Redux state
    const effectiveIsExpanded = typeof controlledExpanded !== 'undefined' ? controlledExpanded : isExpanded

    useHotkeys(
        'mod+k',
        (event) => {
            event.preventDefault()
            if (effectiveIsExpanded && document.activeElement === searchInputRef.current) {
                searchInputRef.current?.blur()
            }
            if (onExpandedChange) {
                onExpandedChange(!effectiveIsExpanded)
            } else {
                dispatch(setNodePanelExpanded(!isExpanded))
            }
        },
        { enableOnFormTags: true },
        [effectiveIsExpanded, onExpandedChange]
    )

    useHotkeys(
        'esc',
        () => {
            if (effectiveIsExpanded && panelRef.current?.contains(document.activeElement)) {
                if (onExpandedChange) {
                    onExpandedChange(false)
                } else {
                    dispatch(setNodePanelExpanded(false))
                }
            }
        },
        { enableOnFormTags: true },
        [effectiveIsExpanded, onExpandedChange]
    )

    // Handle arrow key navigation within the panel
    useEffect(() => {
        const handlePanelKeyDown = (event: KeyboardEvent) => {
            if (!effectiveIsExpanded || !panelRef.current?.contains(document.activeElement)) {
                return
            }

            // Get all clickable elements in the panel
            const clickableElements = panelRef.current.querySelectorAll('div[role="button"], button, [tabindex="0"]')
            const elements = Array.from(clickableElements)

            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault()
                    setSelectedNodeIndex((prev) => (prev < elements.length - 1 ? prev + 1 : prev))
                    break
                case 'ArrowUp':
                    event.preventDefault()
                    setSelectedNodeIndex((prev) => (prev > 0 ? prev - 1 : prev))
                    break
                case 'Enter':
                    event.preventDefault()
                    if (selectedNodeIndex >= 0 && selectedNodeIndex < elements.length) {
                        ;(elements[selectedNodeIndex] as HTMLElement).click()
                    }
                    break
            }
        }

        if (effectiveIsExpanded) {
            window.addEventListener('keydown', handlePanelKeyDown)
        }

        return () => {
            window.removeEventListener('keydown', handlePanelKeyDown)
        }
    }, [effectiveIsExpanded, selectedNodeIndex])

    // Reset selected index when panel is closed
    useEffect(() => {
        if (!effectiveIsExpanded) {
            setSelectedNodeIndex(-1)
        }
    }, [effectiveIsExpanded])

    useEffect(() => {
        if (effectiveIsExpanded && searchInputRef.current) {
            searchInputRef.current.focus()
        }
    }, [effectiveIsExpanded])

    const defaultHandleAddNode = (nodeName: string): void => {
        if (reactFlowInstance) {
            createNodeAtCenter(nodes, nodeTypes, nodeName, reactFlowInstance, dispatch)
            if (onExpandedChange) {
                onExpandedChange(false)
            } else {
                dispatch(setNodePanelExpanded(false))
            }
        }
    }

    const onAddNode = (nodeName: string): void => {
        if (isCustomAdd && handleAddNode) {
            handleAddNode(nodeName)
        } else {
            defaultHandleAddNode(nodeName)
        }
        if (onExpandedChange) {
            onExpandedChange(false)
        } else {
            dispatch(setNodePanelExpanded(false))
        }
    }

    useEffect(() => {
        setFilteredNodeTypes(
            Object.keys(nodeTypes).reduce((acc, category) => {
                if (searchTerm.trim().length === 0) {
                    return nodeTypes
                }
                const filteredNodes = nodeTypes[category].filter((node: FlowWorkflowNodeType) =>
                    node.name.toLowerCase().includes(searchTerm.toLowerCase())
                )
                if (filteredNodes.length > 0) {
                    acc[category] = filteredNodes
                    setSelectedCategory((prev) => {
                        const newSet = new Set(prev)
                        if (!newSet.has(category)) {
                            newSet.add(category)
                        }
                        return newSet
                    })
                }
                return acc
            }, {} as FlowWorkflowNodeTypesByCategory)
        )
    }, [nodeTypes, searchTerm])

    const handleToggleExpand = () => {
        if (onExpandedChange) {
            onExpandedChange(!effectiveIsExpanded)
        } else {
            dispatch(setNodePanelExpanded(!isExpanded))
        }
    }

    const groupNodesBySubcategory = (nodes: FlowWorkflowNodeType[]): GroupedNodes => {
        return nodes.reduce((acc: GroupedNodes, node) => {
            // Use node.category as subcategory if available, otherwise put in 'Other'
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

    return (
        <div
            ref={panelRef}
            data-node-panel
            data-expanded={effectiveIsExpanded}
            className={`${!effectiveIsExpanded ? 'w-auto h-auto' : 'w-64'} shadow-sm rounded-xl border border-solid border-default-200 bg-background transition-width duration-300 transition-height duration-300`}
        >
            <Tooltip
                content={
                    <div className="px-1 py-2">
                        <div className="text-small font-bold">Keyboard Shortcuts</div>
                        <div className="text-tiny">
                            Press {navigator.platform.includes('Mac') ? '⌘+K' : 'Ctrl+K'} or <kbd>K</kbd> to toggle
                            panel
                        </div>
                    </div>
                }
                placement="right"
            >
                <Button isIconOnly size="md" className="bg-background" onClick={handleToggleExpand}>
                    <Icon
                        icon={effectiveIsExpanded ? 'solar:minus-square-linear' : 'solar:widget-add-linear'}
                        width={'80%'}
                        className="text-default-500"
                    />
                </Button>
            </Tooltip>
            {effectiveIsExpanded && (
                <>
                    <Input
                        ref={searchInputRef}
                        id="node-search-input"
                        type="search"
                        placeholder="Search nodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        fullWidth
                        className="px-2 rounded"
                        startContent={<Icon icon="akar-icons:search" className="text-default-500" />}
                    />
                    <div className="mt-4 max-h-[calc(100vh-16rem)] overflow-auto" id="node-type-accordion">
                        <Accordion
                            selectionMode="multiple"
                            selectedKeys={Array.from(selectedCategory)}
                            onSelectionChange={(keys) => setSelectedCategory(new Set(Array.from(keys) as string[]))}
                        >
                            {Object.keys(filteredNodeTypes)
                                .filter((category) => category !== 'Input/Output')
                                .map((category) => {
                                    const nodes = filteredNodeTypes[category]
                                    const hasSubcategories = nodes.some((node) => node.category)

                                    return (
                                        <AccordionItem key={category} title={category} textValue={category}>
                                            {hasSubcategories ? (
                                                <Accordion selectionMode="multiple">
                                                    {Object.entries(groupNodesBySubcategory(nodes)).map(
                                                        ([
                                                            subcategory,
                                                            { nodes: subcategoryNodes, logo, color, acronym },
                                                        ]) => (
                                                            <AccordionItem
                                                                key={subcategory}
                                                                textValue={subcategory}
                                                                title={
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-8 flex-shrink-0">
                                                                            {logo ? (
                                                                                <img
                                                                                    src={logo}
                                                                                    alt={`${subcategory} Logo`}
                                                                                    className="max-h-5 max-w-5"
                                                                                />
                                                                            ) : (
                                                                                <div
                                                                                    className="node-acronym-tag float-left text-white px-2 py-1 rounded-full text-xs inline-block"
                                                                                    style={{ backgroundColor: color }}
                                                                                >
                                                                                    {acronym}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <span>{subcategory}</span>
                                                                    </div>
                                                                }
                                                            >
                                                                {subcategoryNodes.map((node: FlowWorkflowNodeType) => (
                                                                    <div
                                                                        key={node.name}
                                                                        className="flex items-center cursor-pointer p-2 hover:bg-default-100 ml-4"
                                                                        onClick={() => onAddNode(node.name)}
                                                                    >
                                                                        <span
                                                                            className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-foreground"
                                                                            title={node.config.title}
                                                                        >
                                                                            {node.config.title}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </AccordionItem>
                                                        )
                                                    )}
                                                </Accordion>
                                            ) : (
                                                filteredNodeTypes[category].map((node: FlowWorkflowNodeType) => (
                                                    <div
                                                        key={node.name}
                                                        className="flex items-center cursor-pointer p-2 hover:bg-default-100"
                                                        onClick={() => onAddNode(node.name)}
                                                    >
                                                        <div className="w-16 flex-shrink-0">
                                                            {node.logo ? (
                                                                <img
                                                                    src={node.logo}
                                                                    alt="Node Logo"
                                                                    className="max-h-7 max-w-7"
                                                                />
                                                            ) : (
                                                                <div
                                                                    className={
                                                                        'node-acronym-tag float-left text-white px-2 py-1 rounded-full text-xs inline-block'
                                                                    }
                                                                    style={{ backgroundColor: node.visual_tag.color }}
                                                                >
                                                                    {node.visual_tag.acronym}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span
                                                            className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-foreground"
                                                            title={node.config.title}
                                                        >
                                                            {node.config.title}
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </AccordionItem>
                                    )
                                })}
                        </Accordion>
                    </div>
                </>
            )}
        </div>
    )
}

export default CollapsibleNodePanel
