import { WorkflowCreateRequest } from '@/types/api_types/workflowSchemas'
import { Button, Tooltip } from '@heroui/react'
import { Icon } from '@iconify/react'
import { ReactFlowProvider } from '@xyflow/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../../store/store'
import Chat from '../chat/Chat'
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar'
import EditorCanvas from './EditorCanvas'

interface ChatCanvasProps {
    workflowData?: WorkflowCreateRequest
    workflowID?: string
    onDownloadImageInit?: (handler: () => void) => void
}

// Main content component with chat panel
const ChatCanvasContent: React.FC<ChatCanvasProps> = ({ workflowData, workflowID, onDownloadImageInit }) => {
    // Resize control state for chat panel
    const [chatWidth, setChatWidth] = useState(400) // Default chat panel width
    const [isResizing, setIsResizing] = useState(false)
    const [showChat, setShowChat] = useState(true)
    const containerRef = useRef<HTMLDivElement>(null)

    // Get selected node ID from redux store
    const selectedNodeID = useSelector((state: RootState) => state.flow.selectedNode)

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

    return (
        <div
            ref={containerRef}
            className="relative flex h-full w-full overflow-hidden bg-background dark:bg-background"
            style={{ cursor: isResizing ? 'col-resize' : 'default' }}
        >
            {/* EditorCanvas component */}
            <div className="flex-grow relative h-full overflow-hidden">
                <EditorCanvas
                    workflowData={workflowData}
                    workflowID={workflowID}
                    onDownloadImageInit={onDownloadImageInit}
                    renderNodeSidebarExternally={true}
                    extraPanelButtons={
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
                    }
                />
            </div>

            {/* Node Sidebar - rendered here to ensure it's above the chat panel */}
            {selectedNodeID && (
                <div
                    className="absolute top-0 right-0 h-full bg-background dark:bg-background/80 border-l border-divider"
                    style={{ zIndex: 30 }}
                >
                    <NodeSidebar nodeID={selectedNodeID} key={selectedNodeID} readOnly={false} />
                </div>
            )}

            {/* Chat Panel */}
            {showChat && <ChatPanel workflowID={workflowID} width={chatWidth} onResizeStart={startResizing} />}
        </div>
    )
}

// Memoized ChatPanel component to prevent re-renders
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
                    style={{ width: `${width}px`, zIndex: 20 }}
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

export default ChatCanvas
