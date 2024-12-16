import { useEffect, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { addNode } from '../store/flowSlice';
import { createNode } from '../utils/nodeFactory';
import { AppDispatch } from '../store/store';
import { WorkflowNode } from '../types/nodes/base';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';

export const useKeyboardShortcuts = (
  selectedNodeID: string | null,
  nodes: WorkflowNode[],
  dispatch: AppDispatch
) => {
  const [copiedNode, setCopiedNode] = useState<WorkflowNode | null>(null);
  const nodeTypes = useSelector((state: RootState) => state.nodeTypes.data);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        switch (event.key) {
          case 'c': // CMD + C or CTRL + C
            if (selectedNodeID) {
              const nodeToCopy = nodes.find((node) => node.id === selectedNodeID);
              if (nodeToCopy) {
                setCopiedNode(nodeToCopy);
              }
            }
            break;
          case 'v': // CMD + V or CTRL + V
            if (copiedNode && nodeTypes) {
              const newNode = createNode(
                nodeTypes,
                copiedNode.type,
                uuidv4(),
                {
                  x: copiedNode.position.x + 50,
                  y: copiedNode.position.y + 50,
                },
                copiedNode.data
              );
              if (newNode) {
                dispatch(addNode({ node: newNode }));
              }
            }
            break;
          default:
            break;
        }
      }
    },
    [selectedNodeID, copiedNode, nodes, dispatch, nodeTypes]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return { copiedNode, setCopiedNode };
};
