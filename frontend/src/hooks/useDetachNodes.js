import { useCallback } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';

function useDetachNodes() {
  const { setNodes } = useReactFlow();
  const store = useStoreApi();

  const detachNodes = useCallback(
    (ids, removeParentId) => {
      const { nodeLookup } = store.getState();
      const nextNodes = Array.from(nodeLookup.values()).map((n) => {
        if (ids.includes(n.id) && n.parentId) {
          const parentNode = nodeLookup.get(n.parentId);
          return {
            ...n,
            position: {
              x: n.position.x + (parentNode?.internals.positionAbsolute.x ?? 0),
              y: n.position.y + (parentNode?.internals.positionAbsolute.y ?? 0),
            },
            expandParent: undefined,
            parentId: undefined,
          };
        }
        return n;
      });

      setNodes(
        nextNodes.filter((n) => !removeParentId || n.id !== removeParentId)
      );
    },
    [setNodes, store]
  );

  return detachNodes;
}

export default useDetachNodes;
