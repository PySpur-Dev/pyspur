import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  EdgeProps,
  Position,
} from '@xyflow/react';
import { Button } from '@nextui-org/react';
import { Icon } from "@iconify/react";
import { useDispatch } from 'react-redux';
import { deleteEdge } from '../../../store/flowSlice';
import { ReactFlowNode } from '../../../types/reactflow';

export interface CustomEdgeData {
  showPlusButton?: boolean;
  onPopoverOpen?: (params: {
    sourceNode: ReactFlowNode;
    targetNode: ReactFlowNode;
    edgeId: string;
  }) => void;
}

export interface CustomEdgeProps extends Omit<EdgeProps, 'data'> {
  data?: CustomEdgeData;
  id: string;
  source: string;
  target: string;
  style?: React.CSSProperties;
}

const CustomEdge: React.FC<CustomEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
  source,
  target,
}) => {
  const edgeData = data as CustomEdgeData;
  const { onPopoverOpen, showPlusButton } = edgeData || {};
  const reactFlowInstance = useReactFlow();
  const dispatch = useDispatch();

  // Get the full node objects
  const sourceNode = reactFlowInstance.getNode(source) as ReactFlowNode | null;
  const targetNode = reactFlowInstance.getNode(target) as ReactFlowNode | null;

  // Add validation to ensure nodes exist
  const handleAddNode = () => {
    if (!sourceNode || !targetNode || !onPopoverOpen) {
      console.error('Source or target node not found or onPopoverOpen not provided');
      return;
    }
    onPopoverOpen({
      sourceNode,
      targetNode,
      edgeId: id
    });
  };

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDeleteEdge = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch(deleteEdge({ edgeId: id }));
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />

      {showPlusButton && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              style={{
                display: 'flex',
                gap: '5px',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Button
                isIconOnly
                onClick={handleAddNode}
              >
                <Icon icon="solar:add-circle-linear" width={20} className="text-default-500" />
              </Button>
              <Button
                isIconOnly
                onClick={handleDeleteEdge}
              >
                <Icon icon="solar:trash-bin-trash-linear" width={20} />
              </Button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default CustomEdge;
