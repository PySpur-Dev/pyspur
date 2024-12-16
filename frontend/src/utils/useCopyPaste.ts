import { useState, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useKeyPress, getConnectedEdges } from '@xyflow/react';
import { WritableDraft } from 'immer';
import { setNodes, setEdges } from '../store/flowSlice';
import type { RootState } from '../store/store';
import type { Node, Edge } from '@xyflow/react';
import { WorkflowNode, DynamicNodeConfig } from '../types/nodes/base';
import { CustomEdge } from '../types/reactflow';

// Define types for buffered nodes and edges
type BufferedNode = WorkflowNode<DynamicNodeConfig>;
type BufferedEdge = CustomEdge;

export function useCopyPaste() {
  // Use proper types for Redux selectors
  const nodes = useSelector((state: RootState) => state.flow.nodes) as BufferedNode[];
  const edges = useSelector((state: RootState) => state.flow.edges) as BufferedEdge[];
  const pasteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispatch = useDispatch();

  // Set up the paste buffers to store the copied nodes and edges
  const [bufferedNodes, setBufferedNodes] = useState<BufferedNode[]>([]);
  const [bufferedEdges, setBufferedEdges] = useState<BufferedEdge[]>([]);

  const copy = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    const selectedEdges = getConnectedEdges(selectedNodes, edges).filter((edge) => {
      const isExternalSource = selectedNodes.every((n) => n.id !== edge.source);
      const isExternalTarget = selectedNodes.every((n) => n.id !== edge.target);

      return !(isExternalSource || isExternalTarget);
    });

    setBufferedNodes(selectedNodes);
    setBufferedEdges(selectedEdges);
  }, [nodes, edges]);

  const cut = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    const selectedEdges = getConnectedEdges(selectedNodes, edges).filter((edge) => {
      const isExternalSource = selectedNodes.every((n) => n.id !== edge.source);
      const isExternalTarget = selectedNodes.every((n) => n.id !== edge.target);

      return !(isExternalSource || isExternalTarget);
    });

    setBufferedNodes(selectedNodes);
    setBufferedEdges(selectedEdges);

    const updatedNodes = nodes.filter((node) => !node.selected);
    const updatedEdges = edges.filter((edge) => !selectedEdges.includes(edge));

    dispatch(setNodes(updatedNodes as WritableDraft<WorkflowNode>[]));
    dispatch(setEdges(updatedEdges));
  }, [nodes, edges, dispatch]);

  const paste = useCallback(() => {
    if (bufferedNodes.length === 0 || pasteTimeoutRef.current) return;

    pasteTimeoutRef.current = setTimeout(() => {
      pasteTimeoutRef.current = null;
    }, 300);

    const viewportCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };

    const minX = Math.min(...bufferedNodes.map((s) => s.position.x));
    const minY = Math.min(...bufferedNodes.map((s) => s.position.y));

    const now = Date.now();

    const newNodes = bufferedNodes.map((node) => {
      const id = `${node.id}-${now}`;
      const x = viewportCenter.x / 2 + (node.position.x - minX);
      const y = viewportCenter.y / 2 + (node.position.y - minY);

      return { ...node, id, position: { x, y } };
    });

    const newEdges = bufferedEdges.map((edge) => {
      const id = `${edge.id}-${now}`;
      const source = `${edge.source}-${now}`;
      const target = `${edge.target}-${now}`;

      return { ...edge, id, source, target };
    });

    const updatedNodes = [
      ...nodes.map((node) => ({ ...node, selected: false })),
      ...newNodes,
    ];

    const updatedEdges = [
      ...edges.map((edge) => ({ ...edge, selected: false })),
      ...newEdges,
    ];

    dispatch(setNodes(updatedNodes as WritableDraft<WorkflowNode>[]));
    dispatch(setEdges(updatedEdges));
  }, [bufferedNodes, bufferedEdges, nodes, edges, dispatch]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isFlowCanvasFocused = (event.target as HTMLElement)?.closest('.react-flow');
      if (!isFlowCanvasFocused) return;

      if ((event.metaKey || event.ctrlKey) && event.key === 'c') {
        copy();
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
        paste();
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'x') {
        cut();
      }
    },
    [copy, paste, cut]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (pasteTimeoutRef.current) {
        clearTimeout(pasteTimeoutRef.current);
      }
    };
  }, []);

  return { cut, copy, paste, bufferedNodes, bufferedEdges };
}

export default useCopyPaste;
