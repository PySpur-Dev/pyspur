import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  NodeTypes,
  EdgeTypes,
  ReactFlowInstance,
  XYPosition,
  Node,
  Edge,
  OnInit,
  NodeMouseHandler,
  OnNodesDelete,
  SelectionMode,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSelector, useDispatch } from 'react-redux';
import Operator from './footer/Operator';
import AddNodePopoverFooter from './footer/AddNodePopoverFooter';
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
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownSection, DropdownItem, Button } from '@nextui-org/react';
import DynamicNode from '../nodes/DynamicNode';
import { v4 as uuidv4 } from 'uuid';
import { addNodeBetweenNodes } from './AddNodePopoverCanvas';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import CustomEdge from './edges/CustomEdge';
import { getHelperLines } from '../../utils/helperLines';
import HelperLinesRenderer from '../HelperLines';
import useCopyPaste from '../../utils/useCopyPaste';
import { useModeStore } from '../../store/modeStore';
import { initializeFlow } from '../../store/flowSlice';
import InputNode from '../nodes/InputNode';
import IfElseNode from '../nodes/logic/IfElseNode';
import MergeNode from '../nodes/logic/MergeNode';
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow';
import LoadingSpinner from '../LoadingSpinner';
import dagre from '@dagrejs/dagre';
import CollapsibleNodePanel from '../nodes/CollapsibleNodePanel';
import { WorkflowNode, Workflow, TestInput, WorkflowData } from '../../types/workflow';
import { ReactFlowNode, CustomEdge as CustomEdgeType, workflowToReactFlowNode, reactFlowToWorkflowNode, ReactFlowInstance as CustomReactFlowInstance } from '../../types/reactflow';
import { WritableDraft } from 'immer';
import { findNodeSchema, NODE_TYPES, NodeTypesByCategory } from '../../types/nodes/base';
import { NodeType } from '../../types/nodes/custom';
import { NodeTypesConfig } from '../../types/store/nodeTypes';

// Type definitions
interface FlowCanvasProps {
  workflowData?: WorkflowData;
  workflowID?: string;
}

interface HelperLines {
  horizontal: number | undefined;
  vertical: number | undefined;
}

interface RootState {
  nodeTypes: {
    data: NodeTypesConfig;
  };
  flow: {
    nodes: WorkflowNode[];
    edges: CustomEdgeType[];
    selectedNode: string | null;
    workflowID?: string;
  };
}

const useNodeTypes = ({ nodeTypesConfig }: { nodeTypesConfig: Record<string, NodeType[]> | undefined }) => {
  const nodeTypes = useMemo<Record<string, React.ComponentType<any>>>(() => {
    if (!nodeTypesConfig) return {};
    return Object.keys(nodeTypesConfig).reduce<Record<string, React.ComponentType<any>>>((acc, category) => {
      nodeTypesConfig[category].forEach(node => {
        const nodeType = node.type || node.name;
        const schema = findNodeSchema(nodeType, nodeTypesConfig);
        if (!schema) {
          console.warn(`Node schema for type "${nodeType}" not found in category ${category}`);
          return;
        }
        if (nodeType === 'InputNode') {
          acc[nodeType] = InputNode;
        } else if (nodeType === 'IfElseNode') {
          acc[nodeType] = IfElseNode;
        } else if (nodeType === 'MergeNode') {
          acc[nodeType] = MergeNode;
        } else {
          acc[nodeType] = (props: any) => (
            <DynamicNode {...props} type={nodeType} config={schema.config} />
          );
        }
      });
      return acc;
    }, {});
  }, [nodeTypesConfig]);

  const isLoading = !nodeTypesConfig;
  return { nodeTypes, isLoading };
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge as any, // TODO: Fix this type assertion once EdgeTypes is properly typed
};

// Create a wrapper component that includes ReactFlow logic
const FlowCanvasContent: React.FC<FlowCanvasProps> = (props) => {
  const { workflowData, workflowID } = props;
  const dispatch = useDispatch();

  const nodeTypesConfig = useSelector((state: RootState) => state.nodeTypes.data);

  useEffect(() => {
    if (!workflowData) return;

    console.log('workflowData', workflowData);
    const nodes = workflowData.definition.nodes || [];
    const edges = workflowData.definition.edges || [];

    const inputNode = nodes.find(
      (node: WorkflowNode) => node.type === 'InputNode'
    );
    if (inputNode?.data?.config?.input_schema) {
      const workflowInputVariables = Object.entries(inputNode.data.config.input_schema).map(([key, type]) => ({
        key,
        value: '',
      }));
      workflowInputVariables.forEach(variable => {
        dispatch(setWorkflowInputVariable(variable));
      });
    }
    dispatch(initializeFlow({
      nodeTypes: Object.entries(nodeTypesConfig).reduce((acc, [key, value]) => {
        acc[key] = (Array.isArray(value) ? value : [value]).map(node => ({
          name: node.name || key,
          type: node.type || node.name || key,
          visual_tag: node.visual_tag,
          config: node.config,
          input: { properties: {} },
          output: { properties: {} }
        } as NodeType));
        return acc;
      }, {} as NodeTypesByCategory),
      definition: {
        nodes: nodes,
        edges: edges,
        test_inputs: workflowData.definition.test_inputs || []
      },
      workflowID: workflowID || '',
      name: workflowData.name || 'Untitled Workflow'
    }));
  }, [dispatch, workflowData, workflowID, nodeTypesConfig]);

  const { nodeTypes, isLoading } = useNodeTypes({ nodeTypesConfig });

  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const edges = useSelector((state: RootState) => state.flow.edges);
  const selectedNodeID = useSelector((state: RootState) => state.flow.selectedNode);

  const saveWorkflow = useSaveWorkflow([nodes, edges], 10000);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<ReactFlowNode, CustomEdgeType> | null>(null);
  const [helperLines, setHelperLines] = useState<HelperLines>({ horizontal: undefined, vertical: undefined });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [isPopoverContentVisible, setPopoverContentVisible] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<{ sourceNode: ReactFlowNode; targetNode: ReactFlowNode; edgeId: string } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const showHelperLines = false;

  const onNodesChange: OnNodesChange = useCallback(
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
        const movingNode = nodes.find(n => n.id === positionChange.id);
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

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => dispatch(edgesChange({ changes })),
    [dispatch]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.targetHandle || connection.targetHandle === 'node-body') {
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);

        if (sourceNode && targetNode) {
          const outputHandleName = connection.sourceHandle;

          if (!outputHandleName) {
            console.error('Source handle is not specified.');
            return;
          }

          const updatedInputSchema = {
            ...targetNode.data.config.input_schema,
            [outputHandleName]: 'str',
          };

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

          connection = {
            ...connection,
            targetHandle: outputHandleName,
          };
        }
      }

      const newConnection: Connection = {
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      };

      dispatch(connect({ connection: newConnection }));
    },
    [dispatch, nodes]
  );

  const handlePopoverOpen = useCallback(({ sourceNode, targetNode, edgeId }: { sourceNode: ReactFlowNode; targetNode: ReactFlowNode; edgeId: string }) => {
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

  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: 'custom',
      style: {
        stroke: 'gray',
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

  const onEdgeMouseEnter = useCallback(
    (_: React.MouseEvent, edge: CustomEdgeType) => {
      setHoveredEdge(edge.id);
    },
    []
  );

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onInit: OnInit<ReactFlowNode, CustomEdgeType> = useCallback((instance: ReactFlowInstance<ReactFlowNode, CustomEdgeType>) => {
    setReactFlowInstance(instance);
    instance.fitView();
  }, []);

  const onNodeClick: NodeMouseHandler<ReactFlowNode> = useCallback(
    (_: React.MouseEvent, node: ReactFlowNode) => {
      dispatch(setSelectedNode({ nodeId: node.id }));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeID) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
  }, [dispatch, selectedNodeID]);

  const onNodesDelete: OnNodesDelete<ReactFlowNode> = useCallback(
    (deletedNodes: ReactFlowNode[]) => {
      deletedNodes.forEach((node) => {
        if (node.id) {
          dispatch(deleteNode({ nodeId: node.id }));

          if (selectedNodeID === node.id) {
            dispatch(setSelectedNode({ nodeId: null }));
          }
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
      if (node.width && node.height) {
        dagreGraph.setNode(node.id, { width: node.width, height: node.height });
      }
    });

    const nodeWeights: { [key: string]: number } = {};
    const edgeWeights: { [key: string]: number } = {};

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

    sortedNodes = sortedNodes.reverse();

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
      dagreGraph.setEdge(edge.source, edge.target, { weight, height: 10, width: 10, labelpos: 'c', minlen: 1 });
    });

    dagre.layout(dagreGraph);

    return nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      if (!nodeWithPosition) return node;

      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.width || 0) / 2,
          y: nodeWithPosition.y - (node.height || 0) / 2,
        },
      };
    });
  };

  const handleLayout = useCallback(() => {
    const reactFlowNodes = nodes.map(workflowToReactFlowNode);
    const layoutedNodes = getLayoutedNodes(reactFlowNodes, edges);
    const workflowNodes = layoutedNodes.map(reactFlowToWorkflowNode) as WritableDraft<WorkflowNode>[];
    dispatch(setNodes(workflowNodes));
  }, [nodes, edges, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useKeyboardShortcuts(
    selectedNodeID,
    nodes.map(workflowToReactFlowNode) as WorkflowNode[],
    dispatch
  );

  const { cut, copy, paste, bufferedNodes } = useCopyPaste();
  useCopyPaste();

  const proOptions = {
    hideAttribution: true
  };

  const mode = useModeStore((state) => state.mode);

  const nodesWithMode = useMemo(() => {
    return nodes
      .filter(Boolean)
      .map((node: WorkflowNode) => {
        const reactFlowNode = workflowToReactFlowNode(node);
        return {
          ...reactFlowNode,
          draggable: true,
          selectable: mode === 'select',
        };
      });
  }, [nodes, mode]);

  const onNodeMouseEnter: NodeMouseHandler<ReactFlowNode> = useCallback(
    (_: React.MouseEvent, node: ReactFlowNode) => {
      setHoveredNode(node.id);
    },
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
          <Dropdown>
            <DropdownTrigger>
              <Button>Add Node</Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Add node between nodes">
              {nodeTypesConfig && Object.entries(nodeTypesConfig).map(([category, nodes]) => (
                <DropdownSection key={category} title={category} showDivider>
                  {nodes.map((node) => (
                    <DropdownItem
                      key={node.name}
                      onClick={() => {
                        const nodeTypeConfig = nodeTypesConfig[node.name]?.[0];
                        if (nodeTypeConfig) {
                          addNodeBetweenNodes(
                            nodeTypesConfig as NodeTypesByCategory,
                            nodeTypeConfig.name,
                            selectedEdge.sourceNode,
                            selectedEdge.targetNode,
                            selectedEdge.edgeId,
                            reactFlowInstance as unknown as ReactFlowInstance,
                            dispatch,
                            setPopoverContentVisible
                          );
                        }
                      }}
                    >
                      <div className="text-sm">
                        {String(node.config?.title || node.name)}
                      </div>
                    </DropdownItem>
                  ))}
                </DropdownSection>
              ))}
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
            snapToGrid={true}
            snapGrid={[25, 25]}
          >
            <Background />
            {showHelperLines && (
              <HelperLinesRenderer
                horizontal={helperLines.horizontal}
                vertical={helperLines.vertical}
              />
            )}
            <Operator handleLayout={handleLayout} />
            <AddNodePopoverFooter />
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
