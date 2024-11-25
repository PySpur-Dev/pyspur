import { API } from "@/api";
import { WorkflowNodeSchema, WorkflowResponseSchema } from "@/api/generated";
import { ReactFlowProvider } from "@xyflow/react";
import { GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import "@xyflow/react/dist/style.css";
import { useEffect } from "react";
import { LLMNode, NodeSchema, PrimitiveNode, PythonNode } from "@/types";
import { flowActions, useDispatch, useSelector } from "@/store";
import { FlowCanvas, NodeProperties } from "@/modules";

interface WorkspacePageProps {
  id: string;
  data: WorkflowResponseSchema;
  nodeSupportedTypes: NodeSchema;
}

export async function getServerSideProps({
  params,
}: GetServerSidePropsContext<{ id: string }>): Promise<
  GetServerSidePropsResult<WorkspacePageProps>
> {
  const { id } = params ?? {};

  if (!id) {
    return {
      notFound: true,
    };
  }

  try {
    const workflowData = await API.default.getWorkflowWfWorkflowIdGet(id);
    const nodeSupportedTypes =
      (await API.default.getNodeTypesNodeSupportedTypesGet()) as NodeSchema;

    return {
      props: {
        id,
        data: workflowData,
        nodeSupportedTypes,
      },
    };
  } catch (_error) {
    return {
      notFound: true,
    };
  }
}

export default function WorkspacePage({
  data,
  nodeSupportedTypes,
}: WorkspacePageProps) {
  const dispatch = useDispatch();
  const selectedNode = useSelector((state) => state.flow.selectedNode);



  useEffect(() => {
    const nodes = data.definition.nodes.reduce<{
      [id: string]: WorkflowNodeSchema;
    }>(
      (acc, curr) => ({
        ...acc,
        [curr.id]: curr,
      }),
      {}
    );

    const links = data.definition.links;

    const supportedNodeTypes = Object.values(nodeSupportedTypes)
      .flat()
      .reduce<{
        [id: string]: LLMNode | PrimitiveNode | PythonNode;
      }>(
        (acc, curr) => ({
          ...acc,
          [curr.name]: curr,
        }),
        {}
      );

    dispatch(flowActions.initialize({ nodes, links, supportedNodeTypes }));
  }, [
    data.definition.links,
    data.definition.nodes,
    dispatch,
    nodeSupportedTypes,
  ]);

  return (
    <ReactFlowProvider>
      <FlowCanvas />
      {selectedNode && <NodeProperties node={selectedNode} />}
    </ReactFlowProvider>
  );
}
