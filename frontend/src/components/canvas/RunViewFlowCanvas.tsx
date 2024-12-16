import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  NodeChange,
  EdgeChange,
  Connection,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  NodeTypes as ReactFlowNodeTypes,
  EdgeTypes,
  ReactFlowInstance,
  XYPosition,
  Node,
  Edge,
  OnInit,
  NodeMouseHandler,
  EdgeMouseHandler,
  OnNodesDelete,
  NodeProps,
  PanelPosition,
  Position,
  NodePositionChange
} from '@xyflow/react';
import { ConnectionMode, SelectionMode } from '@xyflow/system';
import '@xyflow/react/dist/style.css';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import Operator from './footer/Operator';
import {
  nodesChange,
  edgesChange,
  connect,
  setSelectedNode,
  deleteNode,
  setWorkflowInputVariable,
  updateNodeData,
  setNodes,
} from '../../store/flowSlice';
import { NodeType, NodeData, BaseNodeConfig, WorkflowNode, DynamicNodeConfig, NodeTypes, NodeTypesByCategory } from '../../types/nodes/base';
import { Workflow, WorkflowDefinition } from '../../types/workflow';
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar';
import { Dropdown, DropdownMenu, DropdownSection, DropdownItem, DropdownTrigger, Button } from '@nextui-org/react';
import { v4 as uuidv4 } from 'uuid';
import { addNodeBetweenNodes } from '../../utils/addNodeBetweenNodes';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import CustomEdge from './edges/CustomEdge';
import { getHelperLines } from '../../utils/helperLines';
import HelperLinesRenderer from '../HelperLines';
import useCopyPaste from '../../utils/useCopyPaste';
import { useModeStore } from '../../store/modeStore';
import { initializeFlow, setNodeOutputs } from '../../store/flowSlice';
import InputNode from '../nodes/InputNode';
import LoadingSpinner from '../LoadingSpinner';
import IfElseNode from '../nodes/logic/IfElseNode';
import OutputDisplayNode from '../nodes/OutputDisplayNode';
import DynamicNode from '../nodes/DynamicNode';
import { ReactFlowNode, CustomEdge as CustomEdgeType } from '../../types/reactflow';
import { CustomNode } from '../../types/nodes/custom';
import dagre from 'dagre';
import { useNodeTypes } from '../../hooks/useNodeTypes';
import { WritableDraft } from 'immer';

interface RunViewFlowCanvasContentProps {
  workflowData: {
    definition: {
      nodes: ReactFlowNode[];
      edges: CustomEdgeType[];
    };
    name?: string;
    id?: string;
  };
  workflowID: string;
  nodeOutputs?: Record<string, unknown>;
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

// Create a wrapper component that includes ReactFlow logic
const RunViewFlowCanvasContent = (props: RunViewFlowCanvasContentProps) => {
  const { workflowData, workflowID, nodeOutputs } = props;

  const dispatch = useDispatch();

  const nodeTypesConfig = useSelector((state: RootState) => state.nodeTypes.data);

  useEffect(() => {
    if (workflowData) {
      console.log('workflowData', workflowData);
      // if the input node already has a schema add it to the workflowInputVariables
      if (workflowData.definition.nodes) {
        const inputNode = workflowData.definition.nodes.filter(node =>
          'node_type' in node && node.node_type === 'InputNode'
        );
        if (inputNode.length > 0 && 'config' in inputNode[0] && inputNode[0].config?.input_schema) {
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
        nodeTypes: Object.entries(nodeTypesConfig).reduce((acc, [key, value]) => {
          acc[key] = Array.isArray(value) ? value : [value];
          return acc;
        }, {} as NodeTypesByCategory),
        workflowID,
        definition: workflowData.definition,
        name: workflowData.name || 'Untitled Workflow'
      }));
      console.log('Node Outputs:', nodeOutputs);
      dispatch(setNodeOutputs(nodeOutputs));

    }

  }, [dispatch, workflowData, workflowID, nodeTypesConfig, nodeOutputs]);

  const { nodeTypes, isLoading } = useNodeTypes({ nodeTypesConfig });

  const nodes = useSelector((state: RootState) => state.flow.nodes) as ReactFlowNode[];
  const edges = useSelector((state: RootState) => state.flow.edges) as CustomEdgeType[];
  const selectedNodeID = useSelector((state: RootState) => state.flow.selectedNode);


  // Manage reactFlowInstance locally
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const [helperLines, setHelperLines] = useState<{ horizontal: number | undefined; vertical: number | undefined }>({
    horizontal: undefined,
    vertical: undefined
  });

  // Add a flag to control the visibility of helper lines
  const showHelperLines = false; // Set to false for now

  const onNodesChange = useCallback<OnNodesChange>(
    (changes: NodeChange[]) => {
      if (!changes.some((c) => c.type === 'position')) {
        setHelperLines({ horizontal: undefined, vertical: undefined });
        dispatch(nodesChange({ changes }));
        return;
      }

      const positionChange = changes.find(
        (c): c is NodeChange & { type: 'position'; position: XYPosition } =>
          c.type === 'position' && c.position !== undefined
      );

      if (positionChange?.position && showHelperLines) {
        const { horizontal, vertical } = getHelperLines(
          {
            id: positionChange.id,
            position: positionChange.position
          },
          nodes.map(node => ({
            id: node.id,
            position: node.position || { x: 0, y: 0 }
          }))
        );

        setHelperLines({
          horizontal: horizontal ?? undefined,
          vertical: vertical ?? undefined
        });

        if (horizontal !== undefined || vertical !== undefined) {
          const snapPosition = { ...positionChange.position };
          if (horizontal !== undefined) snapPosition.y = horizontal;
          if (vertical !== undefined) snapPosition.x = vertical;
          positionChange.position = snapPosition;
        }
      }

      dispatch(nodesChange({ changes }));
    },
    [dispatch, nodes, showHelperLines]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => dispatch(edgesChange({ changes })),
    [dispatch]
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.targetHandle || connection.targetHandle === 'node-body') {
        // The user dropped the connection on the body of the node
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);

        if (sourceNode && targetNode) {
          const outputHandleName = connection.sourceHandle;

          // Ensure the source handle (output variable) is specified
          if (!outputHandleName) {
            console.error('Source handle is not specified.');
            return;
          }

          // Add a new input variable to the target node's input_schema
          const updatedInputSchema = {
            ...targetNode.data.config.input_schema,
            [outputHandleName]: 'str', // Assuming the type is 'str'
          };

          // Dispatch an action to update the target node's data
          dispatch(
            updateNodeData({
              id: targetNode.id,
              data: {
                config: {
                  ...targetNode.data.config,
                  input_schema: updatedInputSchema,
                },
              },
            })
          );

          // Update the connection to include the new targetHandle
          connection = {
            ...connection,
            targetHandle: outputHandleName,
          };
        }
      }

      // Create the new edge with the updated connection
      const newEdge = {
        ...connection,
        id: uuidv4(),
        key: uuidv4(),
      };
      dispatch(connect({ connection: newEdge }));
    },
    [dispatch, nodes]
  );



  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  // State to manage the visibility of the PopoverContent and the selected edge
  const [isPopoverContentVisible, setPopoverContentVisible] = useState<boolean>(false);
  const [selectedEdge, setSelectedEdge] = useState<{ sourceNode: ReactFlowNode; targetNode: ReactFlowNode; edgeId: string; } | null>(null);

  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handlePopoverOpen = useCallback(({ sourceNode, targetNode, edgeId }: {
    sourceNode: ReactFlowNode;
    targetNode: ReactFlowNode;
    edgeId: string;
  }) => {
    if (!reactFlowInstance) return;

    // Calculate center position between nodes in flow coordinates
    const centerX = (sourceNode.position.x + targetNode.position.x) / 2;
    const centerY = (sourceNode.position.y + targetNode.position.y) / 2;

    // Convert flow coordinates to screen coordinates
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

  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: 'custom',
      style: {
        stroke: edge.id === hoveredEdge
          ? 'black'
          : edge.source === hoveredNode || edge.target === hoveredNode
            ? 'black'
            : '#555',
        strokeWidth: edge.id === hoveredEdge
          ? 4
          : edge.source === hoveredNode || edge.target === hoveredNode
            ? 4
            : 2,
      },
      data: {
        ...edge.data,
        showPlusButton: edge.id === hoveredEdge,
        onPopoverOpen: handlePopoverOpen,
      },
      key: edge.id,
    }));
  }, [edges, hoveredNode, hoveredEdge, handlePopoverOpen]);

  const onEdgeMouseEnter = useCallback<EdgeMouseHandler>(
    (event: React.MouseEvent, edge: Edge) => {
      setHoveredEdge(edge.id);
    },
    []
  );

  const onEdgeMouseLeave = useCallback<EdgeMouseHandler>(() => {
    setHoveredEdge(null);
  }, []);

  const onInit = useCallback<OnInit>((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
    instance.setViewport({ x: 0, y: 0, zoom: 0.8 });
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (event: React.MouseEvent, node: Node) => {
      dispatch(setSelectedNode({ nodeId: node.id }));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeID) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
  }, [dispatch, selectedNodeID]);

  const onNodesDelete = useCallback<OnNodesDelete>(
    (deletedNodes: Node[]) => {
      deletedNodes.forEach((node: Node) => {
        dispatch(deleteNode({ nodeId: node.id }));

        if (selectedNodeID === node.id) {
          dispatch(setSelectedNode({ nodeId: null }));
        }
      });
    },
    [dispatch, selectedNodeID]
  );

  // Add this new keyboard handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if the event target is within the ReactFlow container
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

  const getLayoutedNodes = (nodes: ReactFlowNode[], edges: CustomEdgeType[], direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setGraph({
      rankdir: direction,
      align: 'UL',
      edgesep: 10,
      ranksep: 128,
      nodesep: 128,
    });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    nodes.forEach((node) => {
      const width = node.measured?.width ?? 150;  // Default width if measurement not available
      const height = node.measured?.height ?? 40;  // Default height if measurement not available
      dagreGraph.setNode(node.id, { width, height });
    });

    const nodeWeights: Record<string, number> = {};
    const edgeWeights: Record<string, number> = {};

    // Initialize root nodes with weight 1024
    nodes.forEach(node => {
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      if (incomingEdges.length === 0) {
        nodeWeights[node.id] = 1024;
        const outgoingEdges = edges.filter(edge => edge.source === node.id);
        outgoingEdges.forEach(edge => {
          edgeWeights[edge.id] = 512;
        });
      }
    });

    // Perform a topological sort to determine the order of processing nodes
    let sortedNodes: ReactFlowNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (node: ReactFlowNode) => {
      if (visited.has(node.id)) {
        return;
      }
      if (visiting.has(node.id)) {
        throw new Error('Graph has cycles');
      }
      visiting.add(node.id);
      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      outgoingEdges.forEach(edge => {
        const targetNode = nodes.find(n => n.id === edge.target);
        if (targetNode) {
          visit(targetNode);
        }
      });
      visiting.delete(node.id);
      visited.add(node.id);
      sortedNodes.push(node);
    };

    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        visit(node);
      }
    });

    // Reverse the sortedNodes to get the correct topological order
    sortedNodes = sortedNodes.reverse();

    // Calculate weights for nodes and edges
    sortedNodes.forEach(node => {
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      let maxIncomingWeight = -Infinity;

      if (incomingEdges.length > 0) {
        maxIncomingWeight = incomingEdges.reduce((maxWeight, edge) => {
          return Math.max(maxWeight, edgeWeights[edge.id] || -Infinity);
        }, -Infinity);

        nodeWeights[node.id] = (maxIncomingWeight !== -Infinity) ? maxIncomingWeight : 2;
      } else {
        nodeWeights[node.id] = 2;
      }

      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      outgoingEdges.forEach(edge => {
        edgeWeights[edge.id] = nodeWeights[node.id] * 2;
      });
    });

    edges.forEach((edge) => {
      const weight = edgeWeights[edge.id] || 1;
      dagreGraph.setEdge(edge.source, edge.target, { weight: weight, height: 10, width: 10, labelpos: 'c', minlen: 1 });
    });

    dagre.layout(dagreGraph);

    const isHorizontal = direction === 'LR';

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);

      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.measured?.width ?? 150) / 2,
          y: nodeWithPosition.y - (node.measured?.height ?? 40) / 2,
        },
      };
    });

    return layoutedNodes;
  };

  const handleLayout = useCallback(() => {
    const layoutedNodes = getLayoutedNodes(nodes, edges) as WritableDraft<WorkflowNode>[];
    dispatch(setNodes(layoutedNodes));
  }, [nodes, edges, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Use the custom hook for keyboard shortcuts
  const customNodes = nodes.map(node => ({ ...node, type: node.type as string }));
  useKeyboardShortcuts(selectedNodeID, customNodes, dispatch);

  // Add this hook - it will handle the keyboard shortcuts automatically
  useCopyPaste();

  // Add proOptions configuration
  const proOptions = {
    hideAttribution: true
  };

  const mode = useModeStore((state) => state.mode);

  // Add this memoized nodes with mode
  const nodesWithMode = useMemo(() => {
    return nodes
      .filter(Boolean) // Filters out null or undefined nodes
      .map(node => ({
        ...node,
        draggable: true,
        selectable: mode === 'pointer',
        position: node?.position,
        type: node?.type,
        data: node?.data,
      }));
  }, [nodes, mode]);

  // Add node hover handlers
  const onNodeMouseEnter = useCallback<NodeMouseHandler>(
    (event: React.MouseEvent, node: Node) => setHoveredNode(node.id),
    []
  );

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

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
          <div>
            <Dropdown>
              <DropdownTrigger>
                <button>Add Node</button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Add node options">
                {Object.keys(nodeTypesConfig).map((category) => (
                  <DropdownSection key={category} title={category} showDivider>
                    {nodeTypesConfig[category].map((node) => (
                      <DropdownItem
                        key={node.name}
                        onClick={() =>
                          addNodeBetweenNodes(
                            nodeTypesConfig,
                            node.name,
                            selectedEdge.sourceNode,
                            selectedEdge.targetNode,
                            selectedEdge.edgeId,
                            reactFlowInstance,
                            dispatch,
                            setPopoverContentVisible
                          )
                        }
                      >
                        {node.name}
                      </DropdownItem>
                    ))}
                  </DropdownSection>
                ))}
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      )}

      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            height: `100%`,
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
            selectionMode={mode === 'pointer' ? SelectionMode.Partial : SelectionMode.Full}
            selectNodesOnDrag={mode === 'pointer'}
            selectionOnDrag={mode === 'pointer'}
            selectionKeyCode={mode === 'pointer' ? 'Shift' : null}
            multiSelectionKeyCode={mode === 'pointer' ? 'Control' : null}
            deleteKeyCode="Delete"
            nodesConnectable={true}
            connectionMode={ConnectionMode.Loose}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
          >
            <Background />

            {/* Conditionally render HelperLinesRenderer based on the flag */}
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
      </div>
    </div>
  );
};

// Main component that provides the ReactFlow context
const RunViewFlowCanvas = ({
  workflowData,
  workflowID,
  nodeOutputs
}: RunViewFlowCanvasContentProps) => {
  return (
    <ReactFlowProvider>
      <RunViewFlowCanvasContent workflowData={workflowData} workflowID={workflowID} nodeOutputs={nodeOutputs} />
    </ReactFlowProvider>
  );
};

export default RunViewFlowCanvas;
