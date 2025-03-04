import { WorkflowVersionResponse } from './workflowSchemas'
import { TaskResponse } from './taskSchemas'

export type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED'

export interface StartRunRequest {
    initial_inputs?: Record<string, Record<string, any>>
    parent_run_id?: string
}

export interface RunResponse {
    id: string
    workflow_id: string
    workflow_version_id: string
    workflow_version: WorkflowVersionResponse
    status: RunStatus
    run_type: string
    initial_inputs?: Record<string, Record<string, any>>
    input_dataset_id?: string
    outputs?: Record<string, any>
    output_file_id?: string
    start_time?: string
    end_time?: string
    tasks: TaskResponse[]
    percentage_complete?: number
}

export interface PartialRunRequest {
    node_id: string
    rerun_predecessors: boolean
    initial_inputs?: Record<string, Record<string, any>>
    partial_outputs?: Record<string, Record<string, any>>
}

export interface BatchRunRequest {
    dataset_id: string
    mini_batch_size: number
}
