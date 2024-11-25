import { WorkflowNodeSchema } from "@/api/generated";
import * as EdgeTypes from "@/components/EdgeTypes";
import * as NodeTypes from "@/components/NodeTypes";
import { flowActions, useDispatch, useSelector } from "@/store";
import { Edge, Node } from "@/types";
import { createNode, useDebounce } from "@/utils";
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  NodeMouseHandler,
  OnConnect,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo } from "react";

export function FlowCanvas() {
  const dispatch = useDispatch();

  const {
    nodes: nodesMap,
    links,
    supportedNodeTypes,
  } = useSelector((state) => state.flow);
  console.log("nodesMap", nodesMap);

  const [nodes, _setNodes, onNodesChange] = useNodesState(
    Object.values(nodesMap).map((node) => createNode(node, supportedNodeTypes))
  );

  const changedNodes = useMemo(
    () =>
      nodes.reduce<{
        [id: string]: WorkflowNodeSchema;
      }>(
        (acc, node) => ({
          ...acc,
          [node.id]: {
            id: node.id,
            node_type: node.type ?? "",
            config: node.data.config,
            coordinates: node.position,
          },
        }),
        {}
      ),
    [nodes]
  );

  const debouncedNodes = useDebounce(changedNodes, 1000);

  useEffect(() => {
    console.log("nodes", nodes);
  }, [nodes]);

  // useEffect(() => {
  //   dispatch(flowActions.updateNodes(debouncedNodes));
  //   console.log("debouncedNodes", debouncedNodes);
  // }, [debouncedNodes, dispatch]);

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    links.map<Edge>((link, i) => ({
      id: i.toString(),
      key: i,
      selected: false,
      source: link.source_id,
      target: link.target_id,
      sourceHandle: link.source_output_key,
      targetHandle: link.target_input_key,
    }))
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick: NodeMouseHandler<Node> = useCallback(
    (_, node) => {
      dispatch(flowActions.setSelectedNode(node.id));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(
    () => dispatch(flowActions.setSelectedNode(null)),
    [dispatch]
  );

  return (
    <div className="relative w-screen h-screen">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={{ ...NodeTypes }}
        edgeTypes={{ ...EdgeTypes }}
        fitView
        snapToGrid={true}
        snapGrid={[15, 15]}
        panOnScroll
        zoomOnScroll
        minZoom={0.1}
        maxZoom={2}
        nodesConnectable
        deleteKeyCode="Delete"
        connectionMode={ConnectionMode.Loose}
      >
        <Background
          gap={15}
          variant={BackgroundVariant.Dots}
          className="!bg-gray-50"
        />
        <MiniMap nodeStrokeWidth={3} position="bottom-left" zoomable pannable />
      </ReactFlow>
    </div>
  );
}
