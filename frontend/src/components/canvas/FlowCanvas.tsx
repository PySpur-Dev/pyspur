import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  Edge,
  EdgeTypes,
  ReactFlowInstance,
  SelectionMode,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSelector, useDispatch } from 'react-redux';
import Operator from './footer/Operator';
import {
  setSelectedNode,
  deleteNode,
  setNodes,
  FlowWorkflowNode,
  FlowWorkflowEdge,
} from '../../store/flowSlice';
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar';
import { Dropdown, DropdownMenu, DropdownSection, DropdownItem, DropdownTrigger } from '@nextui-org/react';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import CustomEdge from './Edge';
import HelperLinesRenderer from '../HelperLines';
import useCopyPaste from '../../utils/useCopyPaste';
import { useModeStore } from '../../store/modeStore';
import { initializeFlow } from '../../store/flowSlice';
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow';
import LoadingSpinner from '../LoadingSpinner';
import CollapsibleNodePanel from '../nodes/CollapsibleNodePanel';
import { setNodePanelExpanded } from '../../store/panelSlice';
import { insertNodeBetweenNodes } from '../../utils/flowUtils';
import { getLayoutedNodes } from '@/utils/nodeLayoutUtils';
import { WorkflowCreateRequest } from '@/types/api_types/workflowSchemas';
import { RootState } from '../../store/store';
import { useNodeTypes, useStyledEdges, useNodesWithMode, useFlowEventHandlers } from '../../utils/flowUtils';
import isEqual from 'lodash/isEqual';

// Type definitions

interface FlowCanvasProps {
  workflowData?: WorkflowCreateRequest;
  workflowID?: string;
}

interface HelperLines {
  horizontal: number | null;
  vertical: number | null;
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

// Create a wrapper component that includes ReactFlow logic
const FlowCanvasContent: React.FC<FlowCanvasProps> = (props) => {
  const { workflowData, workflowID } = props;
  const dispatch = useDispatch();

  const nodeTypesConfig = useSelector((state: RootState) => state.nodeTypes.data);

  const { nodeTypes, isLoading } = useNodeTypes({
    nodeTypesConfig,
    readOnly: false,
    includeCoalesceNode: true
  });


  useEffect(() => {
    if (workflowData) {
      dispatch(initializeFlow({
        nodeTypes: nodeTypesConfig,
        definition: workflowData.definition,
        workflowID: workflowID,
        name: workflowData.name
      }));
    }
  }, [dispatch, workflowData, workflowID, nodeTypesConfig]);

  const nodes = useSelector((state: RootState) => state.flow.nodes, isEqual);
  const edges = useSelector((state: RootState) => state.flow.edges, isEqual);
  const selectedNodeID = useSelector((state: RootState) => state.flow.selectedNode);

  const saveWorkflow = useSaveWorkflow();

  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      saveWorkflow();
    }
  }, [nodes, edges, saveWorkflow]);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [helperLines, setHelperLines] = useState<HelperLines>({ horizontal: null, vertical: null });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [isPopoverContentVisible, setPopoverContentVisible] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<{ sourceNode: FlowWorkflowNode; targetNode: FlowWorkflowNode; edgeId: string } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const showHelperLines = false;

  const mode = useModeStore((state) => state.mode);

  const handlePopoverOpen = useCallback(({ sourceNode, targetNode, edgeId }: { sourceNode: FlowWorkflowNode; targetNode: FlowWorkflowNode; edgeId: string }) => {
    if (!reactFlowInstance) return;

    const centerX = (sourceNode.position.x + targetNode.position.x) / 2;
    const centerY = (sourceNode.position.y + targetNode.position.y) / 2;

    const screenPos = reactFlowInstance.flowToScreenPosition({
      x: centerX,
      y: centerY,
    });

    setPopoverPosition({
      x: screenPos.x,
      y: screenPos.y
    });
    setSelectedEdge({ sourceNode, targetNode, edgeId });
    setPopoverContentVisible(true);
  }, [reactFlowInstance]);

  const { onNodesChange, onEdgesChange, onConnect } = useFlowEventHandlers({
    dispatch,
    nodes,
    setHelperLines,
  });

  const styledEdges = useStyledEdges({
    edges,
    hoveredNode,
    hoveredEdge,
    handlePopoverOpen,
  });

  const nodesWithMode = useNodesWithMode({
    nodes,
    mode: mode as 'pointer' | 'hand',
  });

  const onEdgeMouseEnter = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setHoveredEdge(edge.id);
    },
    [setHoveredEdge]
  );

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, [setHoveredEdge]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
    instance.setViewport({ x: 0, y: 0, zoom: 0.8 });
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowWorkflowNode) => {
      dispatch(setSelectedNode({ nodeId: node.id }));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeID) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
    dispatch(setNodePanelExpanded(false));
  }, [dispatch, selectedNodeID]);

  const onNodesDelete = useCallback(
    (deletedNodes: FlowWorkflowNode[]) => {
      deletedNodes.forEach((node) => {
        dispatch(deleteNode({ nodeId: node.id }));

        if (selectedNodeID === node.id) {
          dispatch(setSelectedNode({ nodeId: null }));
        }
      });
    },
    [dispatch, selectedNodeID]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isFlowCanvasFocused = (event.target as HTMLElement).closest('.react-flow');
      if (!isFlowCanvasFocused) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter(node => node.selected);
        if (selectedNodes.length > 0) {
          onNodesDelete(selectedNodes);
        }
      }
    },
    [nodes, onNodesDelete]
  );


  const handleLayout = useCallback(() => {
    const layoutedNodes = getLayoutedNodes(nodes as FlowWorkflowNode[], edges as FlowWorkflowEdge[]);
    dispatch(setNodes({ nodes: layoutedNodes }));
  }, [nodes, edges, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useKeyboardShortcuts(selectedNodeID, nodes, nodeTypes, nodeTypesConfig, dispatch);

  const { cut, copy, paste, bufferedNodes } = useCopyPaste();
  useCopyPaste();

  const proOptions = {
    hideAttribution: true
  };

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: FlowWorkflowNode) => {
    setHoveredNode(node.id);
  }, [setHoveredNode]);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, [setHoveredNode]);

  const handleAddNodeBetween = useCallback((
    nodeName: string,
    sourceNode: FlowWorkflowNode,
    targetNode: FlowWorkflowNode,
    edgeId: string
  ) => {
    insertNodeBetweenNodes(
      nodes,
      nodeTypesConfig,
      nodeName,
      sourceNode,
      targetNode,
      edgeId,
      dispatch,
      () => setPopoverContentVisible(false)
    );
  }, [nodes, nodeTypesConfig, reactFlowInstance, dispatch, setPopoverContentVisible]);

  if (isLoading) {
    return <LoadingSpinner />;
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
                setPopoverContentVisible(false);
              }
            }}
            placement="bottom"
          >
            <DropdownTrigger>
              <div></div>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Add node options"
              onAction={(key) => {
                handleAddNodeBetween(
                  key.toString(),
                  selectedEdge.sourceNode,
                  selectedEdge.targetNode,
                  selectedEdge.edgeId
                );
              }}
            >
              {nodeTypesConfig &&
                Object.keys(nodeTypesConfig)
                  .filter(category => category !== "Input/Output")
                  .map((category) => (
                    <DropdownSection key={category} title={category} showDivider>
                      {nodeTypesConfig[category].map((node) => (
                        <DropdownItem key={node.name}>
                          {node.config.title}
                        </DropdownItem>
                      ))}
                    </DropdownSection>
                  ))
              }
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
            nodes={nodesWithMode}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            onInit={onInit}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
            proOptions={proOptions}
            panOnDrag={mode === 'hand' && !nodes.filter(Boolean).some(n => n.selected)}
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
          >
            <Background />
            {showHelperLines && (
              <HelperLinesRenderer
                horizontal={helperLines.horizontal}
                vertical={helperLines.vertical}
              />
            )}
            <Operator handleLayout={handleLayout} />
          </ReactFlow>
        </div>
        {selectedNodeID && (
          <div
            className="absolute top-0 right-0 h-full bg-white border-l border-gray-200"
            style={{ zIndex: 2 }}
          >
            <NodeSidebar nodeID={selectedNodeID} />
          </div>
        )}
        <div className="border-gray-200 absolute top-4 left-4" style={{ zIndex: 2 }}>
          <CollapsibleNodePanel />
        </div>
      </div>
    </div>
  );
};

// Main component that provides the ReactFlow context
const FlowCanvas: React.FC<FlowCanvasProps> = ({ workflowData, workflowID }) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasContent workflowData={workflowData} workflowID={workflowID} />
    </ReactFlowProvider>
  );
};

export default FlowCanvas;