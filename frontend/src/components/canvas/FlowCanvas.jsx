import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ReactFlow, Background, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSelector, useDispatch } from 'react-redux';
import Operator from './footer/operator/Operator';
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
// import ConnectionLine from './ConnectionLine';
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar';
import { Dropdown, DropdownMenu, DropdownSection, DropdownItem } from '@nextui-org/react';
import DynamicNode from '../nodes/DynamicNode';
import { v4 as uuidv4 } from 'uuid';
import { addNodeBetweenNodes } from './AddNodePopoverCanvas';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'; // Import the new hook
import CustomEdge from './edges/CustomEdge';
import { getHelperLines } from '../../utils/helperLines';
import HelperLinesRenderer from '../HelperLines';
import useCopyPaste from '../../utils/useCopyPaste';
import { useModeStore } from '../../store/modeStore';
import { initializeFlow } from '../../store/flowSlice'; // Import the new action
// Import the new API function
import InputNode from '../nodes/InputNode';
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow';
import LoadingSpinner from '../LoadingSpinner'; // Updated import
import ConditionalNode from '../nodes/ConditionalNode';
import dagre from '@dagrejs/dagre';

const useNodeTypes = ({ nodeTypesConfig }) => {
  const nodeTypes = useMemo(() => {
    if (!nodeTypesConfig) return {};
    return Object.keys(nodeTypesConfig).reduce((acc, category) => {
      nodeTypesConfig[category].forEach((node) => {
        if (node.name === 'InputNode') {
          acc[node.name] = InputNode;
        } else if (node.name === 'ConditionalNode') {
          acc[node.name] = ConditionalNode;
        } else {
          acc[node.name] = (props) => {
            return <DynamicNode {...props} type={node.name} />;
          };
        }
      });
      return acc;
    }, {});
  }, [nodeTypesConfig]);

  const isLoading = !nodeTypesConfig;
  return { nodeTypes, isLoading };
};

const edgeTypes = {
  custom: CustomEdge,
};

// Create a wrapper component that includes ReactFlow logic
const FlowCanvasContent = (props) => {
  const { workflowData, workflowID, children } = props;

  const dispatch = useDispatch();

  const nodeTypesConfig = useSelector((state) => state.nodeTypes.data);

  useEffect(() => {
    if (workflowData) {
      console.log('workflowData', workflowData);
      // if the input node already has a schema add it to the workflowInputVariables
      if (workflowData.definition.nodes) {
        const inputNode = workflowData.definition.nodes.filter((node) => node.node_type === 'InputNode');
        if (inputNode.length > 0) {
          const inputSchema = inputNode[0].config.input_schema;
          if (inputSchema) {
            const workflowInputVariables = Object.entries(inputSchema).map(([key, type]) => {
              return { key, value: '' };
            });
            workflowInputVariables.forEach((variable) => {
              dispatch(setWorkflowInputVariable(variable));
            });
          }
        }
      }
      dispatch(
        initializeFlow({
          nodeTypes: nodeTypesConfig,
          ...workflowData,
          workflowID,
        }),
      );
    }
  }, [dispatch, workflowData, workflowID]);

  const { nodeTypes, isLoading } = useNodeTypes({ nodeTypesConfig });

  const nodes = useSelector((state) => state.flow.nodes);
  const edges = useSelector((state) => state.flow.edges);
  const selectedNodeID = useSelector((state) => state.flow.selectedNode);

  const saveWorkflow = useSaveWorkflow([nodes, edges], 10000); // 10 second delay

  // Manage reactFlowInstance locally
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [helperLines, setHelperLines] = useState({
    horizontal: null,
    vertical: null,
  });

  // Add a flag to control the visibility of helper lines
  const showHelperLines = false; // Set to false for now

  const onNodesChange = useCallback(
    (changes) => {
      if (!changes.some((c) => c.type === 'position')) {
        setHelperLines({ horizontal: null, vertical: null });
        dispatch(nodesChange({ changes }));
        return;
      }

      const positionChange = changes.find((c) => c.type === 'position' && c.position);

      if (positionChange && showHelperLines) {
        const { horizontal, vertical } = getHelperLines(positionChange, nodes);
        setHelperLines({ horizontal, vertical });

        if (horizontal || vertical) {
          const snapPosition = {
            x: positionChange.position.x,
            y: positionChange.position.y,
          };
          if (horizontal) snapPosition.y = horizontal;
          if (vertical) snapPosition.x = vertical;
          positionChange.position = snapPosition;
        }
      }

      dispatch(nodesChange({ changes }));
    },
    [dispatch, nodes, showHelperLines],
  );

  const onEdgesChange = useCallback((changes) => dispatch(edgesChange({ changes })), [dispatch]);
  const onConnect = useCallback(
    (connection) => {
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
            }),
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
    [dispatch, nodes],
  );

  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  // State to manage the visibility of the PopoverContent and the selected edge
  const [isPopoverContentVisible, setPopoverContentVisible] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState(null);

  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });

  const handlePopoverOpen = useCallback(
    ({ sourceNode, targetNode, edgeId }) => {
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
        y: screenPos.y,
      });
      setSelectedEdge({ sourceNode, targetNode, edgeId });
      setPopoverContentVisible(true);
    },
    [reactFlowInstance],
  );

  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: 'custom',
      style: {
        stroke:
          edge.id === hoveredEdge
            ? 'black'
            : edge.source === hoveredNode || edge.target === hoveredNode
            ? 'black'
            : '#555',
        strokeWidth: edge.id === hoveredEdge ? 4 : edge.source === hoveredNode || edge.target === hoveredNode ? 4 : 2,
      },
      data: {
        ...edge.data,
        showPlusButton: edge.id === hoveredEdge,
        onPopoverOpen: handlePopoverOpen,
      },
      key: edge.id,
    }));
  }, [edges, hoveredNode, hoveredEdge, handlePopoverOpen]);

  const onEdgeMouseEnter = useCallback((event, edge) => {
    setHoveredEdge(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onInit = useCallback((instance) => {
    setReactFlowInstance(instance);
    instance.setViewport({ x: 0, y: 0, zoom: 0.8 }); // Set zoom to 100%
  }, []);

  const onNodeClick = useCallback(
    (event, node) => {
      dispatch(setSelectedNode({ nodeId: node.id }));
    },
    [dispatch],
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeID) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
  }, [dispatch, selectedNodeID]);

  const onNodesDelete = useCallback(
    (deletedNodes) => {
      deletedNodes.forEach((node) => {
        dispatch(deleteNode({ nodeId: node.id }));

        if (selectedNodeID === node.id) {
          dispatch(setSelectedNode({ nodeId: null }));
        }
      });
    },
    [dispatch, selectedNodeID],
  );

  // Add this new keyboard handler
  const handleKeyDown = useCallback(
    (event) => {
      // Check if the event target is within the ReactFlow container
      const isFlowCanvasFocused = event.target.closest('.react-flow');
      if (!isFlowCanvasFocused) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter((node) => node.selected);
        if (selectedNodes.length > 0) {
          onNodesDelete(selectedNodes);
        }
      }
    },
    [nodes, onNodesDelete],
  );

  const getLayoutedNodes = (nodes, edges, direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setGraph({
      rankdir: direction,
      align: 'UL',
      edgesep: 10,
      ranksep: 128,
      nodesep: 128,
      // ranker: 'longest-path'
    });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, {
        width: node.measured.width,
        height: node.measured.height,
      });
    });

    const nodeWeights = {};
    const edgeWeights = {};

    // Initialize root nodes with weight 1024
    nodes.forEach((node) => {
      const incomingEdges = edges.filter((edge) => edge.target === node.id);
      if (incomingEdges.length === 0) {
        nodeWeights[node.id] = 1024;
        // set weight for all outgoing edges to half of the node weight
        const outgoingEdges = edges.filter((edge) => edge.source === node.id);
        outgoingEdges.forEach((edge) => {
          edgeWeights[edge.id] = 512;
        });
      }
    });

    // Perform a topological sort to determine the order of processing nodes
    let sortedNodes = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (node) => {
      if (visited.has(node.id)) {
        return;
      }
      if (visiting.has(node.id)) {
        throw new Error('Graph has cycles');
      }
      visiting.add(node.id);
      const outgoingEdges = edges.filter((edge) => edge.source === node.id);
      outgoingEdges.forEach((edge) => {
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (targetNode) {
          visit(targetNode);
        }
      });
      visiting.delete(node.id);
      visited.add(node.id);
      sortedNodes.push(node);
    };

    nodes.forEach((node) => {
      if (!visited.has(node.id)) {
        visit(node);
      }
    });

    // Reverse the sortedNodes to get the correct topological order
    sortedNodes = sortedNodes.reverse();

    // Calculate weights for nodes and edges
    // Each node weight is the maximum of the incoming edges' weights
    // Each edge weight is twice its source node's weight
    sortedNodes.forEach((node) => {
      const incomingEdges = edges.filter((edge) => edge.target === node.id);
      let maxIncomingWeight = -Infinity;

      if (incomingEdges.length > 0) {
        maxIncomingWeight = incomingEdges.reduce((maxWeight, edge) => {
          return Math.max(maxWeight, edgeWeights[edge.id] || -Infinity);
        }, -Infinity);

        nodeWeights[node.id] = maxIncomingWeight !== -Infinity ? maxIncomingWeight : 2;
      } else {
        // Root nodes (no incoming edges) have weight 2
        nodeWeights[node.id] = 2;
      }

      const outgoingEdges = edges.filter((edge) => edge.source === node.id);
      outgoingEdges.forEach((edge) => {
        edgeWeights[edge.id] = nodeWeights[node.id] * 2;
      });
    });

    edges.forEach((edge) => {
      const weight = edgeWeights[edge.id] || 1; // Use edgeWeights if available, default to 1
      dagreGraph.setEdge(edge.source, edge.target, {
        weight: weight,
        height: 10,
        width: 10,
        labelpos: 'c',
        minlen: 1,
      });
    });

    dagre.layout(dagreGraph);

    const isHorizontal = direction === 'LR';

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);

      return {
        ...node,
        position: {
          x: nodeWithPosition.x - node.measured.width / 2,
          y: nodeWithPosition.y - node.measured.height / 2,
        },
      };
    });

    return layoutedNodes;
  };

  const handleLayout = useCallback(() => {
    const layoutedNodes = getLayoutedNodes(nodes, edges);
    dispatch(setNodes({ nodes: layoutedNodes }));
  }, [nodes, edges, dispatch]);

  // Add effect to handle keyboard events
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Use the custom hook for keyboard shortcuts
  useKeyboardShortcuts(selectedNodeID, nodes, dispatch);

  const { cut, copy, paste, bufferedNodes } = useCopyPaste();

  // const canCopy = nodes.some(({ selected }) => selected);
  // const canPaste = bufferedNodes.length > 0;

  // Add this hook - it will handle the keyboard shortcuts automatically
  useCopyPaste();

  // Add proOptions configuration
  const proOptions = {
    hideAttribution: true,
  };

  const mode = useModeStore((state) => state.mode);

  // Add this memoized nodes with mode
  const nodesWithMode = useMemo(() => {
    return nodes
      .filter(Boolean) // Filters out null or undefined nodes
      .map((node) => ({
        ...node,
        draggable: true,
        selectable: mode === 'pointer',
        position: node?.position,
        type: node?.type,
        data: node?.data,
      }));
  }, [nodes, mode]);

  // Add node hover handlers
  const onNodeMouseEnter = useCallback((event, node) => {
    setHoveredNode(node.id);
  }, []);

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
          <Dropdown isOpen={isPopoverContentVisible} onOpenChange={setPopoverContentVisible} placement="bottom">
            <DropdownMenu>
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
                          setPopoverContentVisible,
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
            panOnDrag={mode === 'hand' && !nodes.filter(Boolean).some((n) => n.selected)}
            panOnScroll={true}
            zoomOnScroll={true}
            minZoom={0.1}
            maxZoom={2}
            selectionMode={mode === 'pointer' ? 1 : 0}
            selectNodesOnDrag={mode === 'pointer'}
            selectionOnDrag={mode === 'pointer'}
            selectionKeyCode={mode === 'pointer' ? null : false}
            multiSelectionKeyCode={mode === 'pointer' ? null : false}
            deleteKeyCode="Delete"
            nodesConnectable={true}
            connectionMode="loose"
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
          >
            <Background />

            {/* Conditionally render HelperLinesRenderer based on the flag */}
            {showHelperLines && (
              <HelperLinesRenderer horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
            )}

            <Operator handleLayout={handleLayout} />
          </ReactFlow>
        </div>
        {selectedNodeID && (
          <div className="absolute top-0 right-0 h-full bg-white border-l border-gray-200" style={{ zIndex: 2 }}>
            {children ? children : <NodeSidebar nodeID={selectedNodeID} />}
          </div>
        )}
      </div>
    </div>
  );
};

// Main component that provides the ReactFlow context
const FlowCanvas = ({ workflowData, workflowID, children }) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasContent workflowData={workflowData} workflowID={workflowID} children={children} />
    </ReactFlowProvider>
  );
};

export default FlowCanvas;
