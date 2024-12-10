import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { deleteNode, setSelectedNode, updateNodeData, addNode, setEdges } from '../../store/flowSlice';
import { Handle, getConnectedEdges, Node as XYNode, Edge, Position } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { getUniqueNodeTitle, FlowNode } from '../../utils/nodeTitleUtils';
import {
  Card,
  CardHeader,
  CardBody,
  Divider,
  Button,
  Input,
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import usePartialRun from '../../hooks/usePartialRun';

interface NodeData {
  run?: Record<string, any>;
  status?: string;
  acronym?: string;
  color?: string;
  title?: string;
  config?: {
    title?: string;
    [key: string]: any;
  };
  input?: {
    properties: Record<string, any>;
    [key: string]: any;
  };
  output?: {
    properties: Record<string, any>;
    [key: string]: any;
  };
  [key: string]: any;
}

type Node = XYNode<NodeData>;

interface RootState {
  flow: {
    nodes: Node[];
    edges: Edge[];
    selectedNode: string | null;
    testInputs?: Array<{ id: string; [key: string]: any }>;
  };
}

interface BaseNodeProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  id: string;
  data?: NodeData;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  isInputNode?: boolean;
  className?: string;
  handleOpenModal?: () => void;
}

const BaseNode: React.FC<BaseNodeProps> = ({
  isCollapsed,
  setIsCollapsed,
  handleOpenModal, id,
  data = {},
  children,
  style = {},
  isInputNode = false,
  className = ''
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const dispatch = useDispatch();

  // Retrieve the node's position and edges from the Redux store
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const node = nodes.find((n) => n.id === id);
  const edges = useSelector((state: RootState) => state.flow.edges);
  const selectedNodeId = useSelector((state: RootState) => state.flow.selectedNode);

  const initialInputs = useSelector((state: RootState) => {
    const inputNodeId = state.flow?.nodes.find((node) => node.type === 'InputNode')?.id;
    let testInputs = state.flow?.testInputs;
    if (testInputs && Array.isArray(testInputs) && testInputs.length > 0) {
      const { id, ...rest } = testInputs[0];
      return {[inputNodeId as string]: rest};
    }
    return { [inputNodeId as string]: {} };
  });

  const availableOutputs = useSelector((state: RootState) => {
    const nodes = state.flow.nodes;
    const availableOutputs: Record<string, any> = {};
    nodes.forEach((node) => {
      if (node.data && node.data.run) {
        availableOutputs[node.id] = node.data.run;
      }
    });
    return availableOutputs;
  });

  const { executePartialRun, loading } = usePartialRun();

  const handleMouseEnter = () => {
    setIsHovered(true);
    setShowControls(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!isTooltipHovered) {
      setTimeout(() => {
        setShowControls(false);
      }, 200);
    }
  };

  const handleDelete = () => {
    dispatch(deleteNode({ nodeId: id }));
    if (selectedNodeId === id) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
  };

  const handlePartialRun = () => {
    if (!node) {
      return;
    }
    setIsRunning(true);
    const rerunPredecessors = false;

    const workflowId = window.location.pathname.split('/').pop();
    if (!workflowId) return;

    executePartialRun({
      workflowId,
      nodeId: id,
      inputs: initialInputs,
      availableOutputs,
      rerunPredecessors
    }).then((result) => {
      if (result) {
        Object.entries(result).forEach(([nodeId, output_values]) => {
          if (output_values) {
            dispatch(updateNodeData({
              id: nodeId,
              data: {
                run: {
                  ...(node?.data?.run || {}),
                  ...(output_values || {})
                }
              }
            }));
            dispatch(setSelectedNode({ nodeId }));
          }
        });
      }
    }).finally(() => {
      setIsRunning(false);
    });
  };

  const handleDuplicate = () => {
    if (!node || !node.position) {
      console.error('Node position not found');
      return;
    }

    // Get all edges connected to the current node
    const connectedEdges = getConnectedEdges([node], edges);

    // Generate a new unique ID for the duplicated node
    const newNodeId = `node_${Date.now()}`;

    // Get unique title for the duplicated node
    const baseTitle = node.data?.config?.title || node.data?.title || 'Untitled';
    const uniqueTitle = getUniqueNodeTitle(baseTitle, nodes as FlowNode[]);

    // Create the new node with an offset position and unique title
    const newNode = {
      ...node,
      id: newNodeId,
      position: { x: node.position.x + 20, y: node.position.y + 20 },
      selected: false,
      data: {
        ...(node.data || {}),
        title: uniqueTitle,
        config: {
          ...(node.data?.config || {}),
          title: uniqueTitle,
        },
      },
    } as Node;

    // Duplicate the edges connected to the node
    const newEdges = connectedEdges.map((edge) => {
      const newEdgeId = uuidv4();
      return {
        ...edge,
        id: newEdgeId,
        source: edge.source === id ? newNodeId : edge.source,
        target: edge.target === id ? newNodeId : edge.target,
      };
    });

    // Dispatch actions to add the new node and edges
    dispatch(addNode({ node: newNode }));
    dispatch(setEdges({ edges: [...edges, ...newEdges] }));
  };

  const isSelected = String(id) === String(selectedNodeId);

  const status = data.run ? 'completed' : (data.status || 'default').toLowerCase();

  const borderColor = isRunning ? 'blue' :
    status === 'completed' ? '#4CAF50' :
      status === 'failed' ? 'red' :
        status === 'default' ? 'gray' :
          style.borderColor || '#ccc';

  const { backgroundColor, ...restStyle } = style || {};

  const cardStyle: React.CSSProperties = {
    ...restStyle,
    borderColor: borderColor,
    borderWidth: isSelected
      ? '3px'
      : status === 'completed'
      ? '2px'
      : isHovered
      ? '3px'
      : restStyle.borderWidth || '1px',
    borderStyle: 'solid',
    transition: 'border-color 0.1s, border-width 0.02s',
  };

  const acronym = data.acronym || 'N/A';
  const color = data.color || '#ccc';

  const tagStyle: React.CSSProperties = {
    backgroundColor: color,
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    display: 'inline-block',
  };

  return (
    <div
      style={{ position: 'relative' }}
      draggable={false}
    >
      {/* Container to hold the Handle and the content */}
      <div style={{ position: 'relative' }}>
        {/* Hidden target handle covering the entire node */}
        <Handle
          type="target"
          position={Position.Top}
          id="node-body"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 10,
            opacity: 0,
            pointerEvents: 'auto',
          }}
          isConnectable={true}
        />

        {/* Node content wrapped in drag handle */}
        <div
          className="react-flow__node-drag-handle"
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: 'none', // Prevents content from blocking events
          }}
        >
          <Card
            className={`base-node ${className || ''}`}
            style={{ ...cardStyle, pointerEvents: 'auto' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            isHoverable
            classNames={{
              base: "bg-background border-default-200"
            }}
          >
            {data && data.title && (
              <CardHeader
                style={{
                  position: 'relative',
                  paddingTop: '8px',
                  paddingBottom: isCollapsed ? '0px' : '16px',
                }}
              >
                {editingTitle ? (
                  <Input
                    autoFocus
                    defaultValue={data?.config?.title || data?.title || 'Untitled'}
                    size="sm"
                    variant="faded"
                    radius="lg"
                    onBlur={(e) => {
                      setEditingTitle(false);
                      dispatch(updateNodeData({
                        id,
                        data: {
                          config: {
                            ...data.config,
                            title: e.target.value,
                          },
                        },
                      }));
                    }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        e.stopPropagation();
                        e.preventDefault();
                        setEditingTitle(false);
                        if (e.key === 'Enter') {
                          dispatch(updateNodeData({
                            id,
                            data: {
                              config: {
                                ...data.config,
                                title: (e.target as HTMLInputElement).value,
                              },
                            },
                          }));
                        }
                      }
                    }}
                    classNames={{
                      input: 'bg-default-100',
                      inputWrapper: 'shadow-none',
                    }}
                  />
                ) : (
                  <h3
                    className="text-lg font-semibold text-center cursor-pointer hover:text-primary"
                    style={{ marginBottom: isCollapsed ? '4px' : '8px' }}
                    onClick={() => setEditingTitle(true)}
                  >
                    {data?.config?.title || data?.title || 'Untitled'}
                  </h3>
                )}

                {/* Container for the collapse button and acronym tag */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {/* Collapse Button */}
                  <Button
                    size="sm"
                    variant="flat"
                    style={{
                      minWidth: 'auto',
                      height: '24px',
                      padding: '0 8px',
                      fontSize: '0.8rem',
                      marginRight: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCollapsed(!isCollapsed);
                    }}
                  >
                    {isCollapsed ? '▼' : '▲'}
                  </Button>

                  {/* Acronym Tag */}
                  <div style={{ ...tagStyle }} className="node-acronym-tag">
                    {acronym}
                  </div>
                </div>
              </CardHeader>
            )}
            {!isCollapsed && <Divider />}

            <CardBody className="px-1">
              {children}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Controls */}
      {(showControls || isSelected) && (
        <Card
          onMouseEnter={() => {
            setShowControls(true);
            setIsTooltipHovered(true);
          }}
          onMouseLeave={() => {
            setIsTooltipHovered(false);
            setTimeout(() => {
              if (!isHovered) {
                setShowControls(false);
              }
            }, 300);
          }}
          style={{
            position: 'absolute',
            top: '-50px',
            right: '0px',
            padding: '4px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            pointerEvents: 'auto',
          }}
          classNames={{
            base: "bg-background border-default-200"
          }}
        >
          <div className="flex flex-row gap-1">
            <Button
              isIconOnly
              radius="full"
              variant="light"
              onPress={handlePartialRun}
              disabled={loading}
            >
              <Icon className="text-default-500" icon="solar:play-linear" width={22} />
            </Button>
            {!isInputNode && (
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onPress={handleDelete}
              >
                <Icon className="text-default-500" icon="solar:trash-bin-trash-linear" width={22} />
              </Button>
            )}
            {/* Duplicate Button */}
            <Button
              isIconOnly
              radius="full"
              variant="light"
              onPress={handleDuplicate}
            >
              <Icon className="text-default-500" icon="solar:copy-linear" width={22} />
            </Button>
            {/* View Output Button */}
            {handleOpenModal && (
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onPress={handleOpenModal}
              >
                <Icon className="text-default-500" icon="solar:eye-linear" width={22} />
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default BaseNode;
