import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  useReactFlow,
} from '@xyflow/react';
import { Button } from '@nextui-org/react';
import { Icon } from "@iconify/react";
import { useDispatch } from 'react-redux';
import { deleteEdge } from '../../../store/flowSlice';

const CustomEdge = ({
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
  const { onPopoverOpen, showPlusButton } = data;
  const reactFlowInstance = useReactFlow();
  const dispatch = useDispatch();

  // Get the full node objects
  const sourceNode = reactFlowInstance.getNode(source);
  const targetNode = reactFlowInstance.getNode(target);

  // Add validation to ensure nodes exist
  const handleAddNode = () => {
    if (!sourceNode || !targetNode) {
      console.error('Source or target node not found');
      return;
    }
    onPopoverOpen({
      sourceNode: {
        id: sourceNode.id,
        position: sourceNode.position,
        data: sourceNode.data
      },
      targetNode: {
        id: targetNode.id,
        position: targetNode.position,
        data: targetNode.data
      },
      edgeId: id
    });
  };
  const borderRadius = 16;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius,
  });

  const handleDeleteEdge = (event) => {
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
                auto
                onClick={handleAddNode}
              >
                <Icon icon="solar:add-circle-linear" width={20} className="text-default-500" />
              </Button>
              <Button
                isIconOnly
                auto
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