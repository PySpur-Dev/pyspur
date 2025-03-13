export enum SpurType {
    WORKFLOW = 'workflow',
    CHATBOT = 'chatbot',
    AGENT = 'agent',
}

export interface WorkflowNodeCoordinates {
    x: number
    y: number
}

export interface WorkflowNodeDimensions {
    width: number
    height: number
}

export interface TestInput {
    id: number
    [key: string]: any
}

export interface WorkflowNode {
    id: string
    title: string
    node_type: string
    config: Record<string, any>
    coordinates?: WorkflowNodeCoordinates
    dimensions?: WorkflowNodeDimensions
    subworkflow?: WorkflowDefinition
    parent_id?: string
}

export interface WorkflowLink {
    source_id: string
    target_id: string
    source_handle?: string
    target_handle?: string
}

export interface WorkflowDefinition {
    nodes: WorkflowNode[]
    links: WorkflowLink[]
    test_inputs: TestInput[]
    spur_type?: SpurType
}

export interface WorkflowCreateRequest {
    name: string
    description: string
    definition?: WorkflowDefinition
}

export interface WorkflowResponse {
    id: string
    name: string
    description?: string
    definition: WorkflowDefinition
    created_at: string
    updated_at: string
}

export interface WorkflowVersionResponse {
    version: number
    name: string
    description?: string
    definition: WorkflowDefinition
    definition_hash: string
    created_at: string
    updated_at: string
}
