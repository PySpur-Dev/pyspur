import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  Node,
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
  setWorkflowInputVariable,
  setNodes,
  FlowWorkflowNode,
  FlowWorkflowEdge,
} from '../../store/flowSlice';
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar';
import CustomEdge from './Edge';
import HelperLinesRenderer from '../HelperLines';
import { useModeStore } from '../../store/modeStore';
import { initializeFlow, setNodeOutputs } from '../../store/flowSlice';
import LoadingSpinner from '../LoadingSpinner';
import { WorkflowDefinition } from '@/types/api_types/workflowSchemas';
import { getLayoutedNodes } from '@/utils/nodeLayoutUtils';
import { RootState } from '../../store/store';
import { useNodeTypes, useStyledEdges, useNodesWithMode, useFlowEventHandlers } from '../../utils/flowUtils';


interface RunViewFlowCanvasProps {
  workflowData?: { name: string, definition: WorkflowDefinition };
  workflowID?: string;
  nodeOutputs?: Record<string, any>;
}

interface HelperLines {
  horizontal: number | null;
  vertical: number | null;
}

const RunViewFlowCanvasContent: React.FC<RunViewFlowCanvasProps> = ({ workflowData, workflowID, nodeOutputs }) => {
  const dispatch = useDispatch();

  const nodeTypesConfig = useSelector((state: RootState) => state.nodeTypes.data);

  const { nodeTypes, isLoading } = useNodeTypes({
    nodeTypesConfig,
    readOnly: true,
    includeCoalesceNode: false
  });

  const edgeTypes = useMemo<EdgeTypes>(() => ({
    custom: (props: any) => <CustomEdge {...props} readOnly={true} />
  }), []);

  useEffect(() => {
    if (workflowData) {
      if (workflowData.definition.nodes) {
        const inputNode = workflowData.definition.nodes.filter(node => node.node_type === 'InputNode');
        if (inputNode.length > 0) {
          const inputSchema = inputNode[0].config.input_schema;
          if (inputSchema) {
            const workflowInputVariables = Object.entries(inputSchema).map(([key, type]) => {
              return { key, value: '' };
            });
            workflowInputVariables.forEach(variable => {
              dispatch(setWorkflowInputVariable(variable));
            });
          }
        }
      }
      dispatch(initializeFlow({
        nodeTypes: nodeTypesConfig,
        definition: workflowData.definition,
        workflowID: workflowID,
        name: workflowData.name
      }));
      dispatch(setNodeOutputs(nodeOutputs));
    }
  }, [dispatch, workflowData, workflowID]);

  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const edges = useSelector((state: RootState) => state.flow.edges);
  const selectedNodeID = useSelector((state: RootState) => state.flow.selectedNode);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [helperLines, setHelperLines] = useState<HelperLines>({ horizontal: null, vertical: null });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);


  const showHelperLines = false;

  const mode = useModeStore((state) => state.mode);

  const { onNodesChange, onEdgesChange, onConnect } = useFlowEventHandlers({
    dispatch,
    nodes,
    setHelperLines,
  });

  const styledEdges = useStyledEdges({
    edges,
    hoveredNode,
    hoveredEdge,
    readOnly: true,
  });

  const nodesWithMode = useNodesWithMode({
    nodes,
    mode: mode as 'pointer' | 'hand',
  });

  const onEdgeMouseEnter = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setHoveredEdge(edge.id);
    },
    []
  );

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
    instance.setViewport({ x: 0, y: 0, zoom: 0.8 });
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      dispatch(setSelectedNode({ nodeId: node.id }));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeID) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
  }, [dispatch, selectedNodeID]);

  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
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

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const handleLayout = useCallback(() => {
    const layoutedNodes = getLayoutedNodes(nodes as FlowWorkflowNode[], edges as FlowWorkflowEdge[]);
    dispatch(setNodes({ nodes: layoutedNodes }));
  }, [nodes, edges, dispatch]);


  if (isLoading) {
    return <LoadingSpinner />;
  }

  const proOptions = {
    hideAttribution: true
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
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
            key={`flow-${workflowID}`}
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
            selectionKeyCode={mode === 'pointer' ? null : undefined}
            multiSelectionKeyCode={mode === 'pointer' ? null : undefined}
            deleteKeyCode="Delete"
            nodesConnectable={true}
            connectionMode={ConnectionMode.Loose}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
            snapToGrid={false}
          >
            <Background key="background" />
            {showHelperLines && (
              <HelperLinesRenderer
                key="helper-lines"
                horizontal={helperLines.horizontal}
                vertical={helperLines.vertical}
              />
            )}
            <Operator key="operator" handleLayout={handleLayout} />
          </ReactFlow>
        </div>
        {selectedNodeID && (
          <div
            className="absolute top-0 right-0 h-full bg-white border-l border-gray-200"
            style={{ zIndex: 2 }}
          >
            <NodeSidebar nodeID={selectedNodeID} key={`node-sidebar-${selectedNodeID}`} />
          </div>
        )}
      </div>
    </div>
  );
};

const RunViewFlowCanvas: React.FC<RunViewFlowCanvasProps> = ({ workflowData, workflowID, nodeOutputs }) => {
  return (
    <ReactFlowProvider>
      <RunViewFlowCanvasContent
        key={`flow-content-${workflowID}`}
        workflowData={workflowData}
        workflowID={workflowID}
        nodeOutputs={nodeOutputs}
      />
    </ReactFlowProvider>
  );
}

export default RunViewFlowCanvas;