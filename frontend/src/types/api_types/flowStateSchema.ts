import {
    FlowWorkflowEdge,
    FlowWorkflowNode,
    FlowWorkflowNodeConfig,
    NodeTypesConfig,
} from '@/types/api_types/nodeTypeSchemas'
import { SpurType, TestInput } from '@/types/api_types/workflowSchemas'

export interface FlowState {
    nodeTypes: NodeTypesConfig
    nodes: FlowWorkflowNode[]
    edges: FlowWorkflowEdge[]
    nodeConfigs: Record<string, FlowWorkflowNodeConfig>
    workflowID: string | null
    selectedNode: string | null
    selectedEdgeId: string | null
    sidebarWidth: number
    projectName: string
    workflowInputVariables: Record<string, any>
    testInputs: TestInput[]
    inputNodeValues: Record<string, any>
    selectedTestInputId: string | null
    history: {
        past: Array<{ nodes: FlowWorkflowNode[]; edges: FlowWorkflowEdge[] }>
        future: Array<{ nodes: FlowWorkflowNode[]; edges: FlowWorkflowEdge[] }>
    }
    isRunModalOpen: boolean
    spurType: SpurType
}
