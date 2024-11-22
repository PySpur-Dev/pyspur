import { Box } from '@xyflow/react';
// @todo import from @xyflow/react when fixed
import {
  boxToRect,
  getNodePositionWithOrigin,
  rectToBox,
} from '@xyflow/system';

// we have to make sure that parent nodes are rendered before their children
export const sortNodes = (a, b) => {
  if (a.type === b.type) {
    return 0;
  }
  return a.type === 'group' && b.type !== 'group' ? -1 : 1;
};

export const getId = (prefix = 'node') => `${prefix}_${Math.random() * 10000}`;

export const getNodePositionInsideParent = (node, groupNode) => {
  const position = node.position ?? { x: 0, y: 0 };
  const nodeWidth = node.measured?.width ?? 0;
  const nodeHeight = node.measured?.height ?? 0;
  const groupWidth = groupNode.measured?.width ?? 0;
  const groupHeight = groupNode.measured?.height ?? 0;

  let newPositionX = position.x;
  let newPositionY = position.y;

  if (newPositionX < groupNode.position.x) {
    newPositionX = 0;
  } else if (newPositionX + nodeWidth > groupNode.position.x + groupWidth) {
    newPositionX = groupWidth - nodeWidth;
  } else {
    newPositionX = newPositionX - groupNode.position.x;
  }

  if (newPositionY < groupNode.position.y) {
    newPositionY = 0;
  } else if (newPositionY + nodeHeight > groupNode.position.y + groupHeight) {
    newPositionY = groupHeight - nodeHeight;
  } else {
    newPositionY = newPositionY - groupNode.position.y;
  }

  return { x: newPositionX, y: newPositionY };
};

export const getBoundsOfBoxes = (box1, box2) => ({
  x: Math.min(box1.x, box2.x),
  y: Math.min(box1.y, box2.y),
  x2: Math.max(box1.x2, box2.x2),
  y2: Math.max(box1.y2, box2.y2),
});

export const getRelativeNodesBounds = (nodes, nodeOrigin = [0, 0]) => {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const box = nodes.reduce(
    (currBox, node) => {
      const { x, y } = getNodePositionWithOrigin(node, nodeOrigin);
      return getBoundsOfBoxes(
        currBox,
        rectToBox({
          x,
          y,
          width: node.width || 0,
          height: node.height || 0,
        })
      );
    },
    { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity }
  );

  return boxToRect(box);
};
