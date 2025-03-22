import axios from 'axios'

import {
    MessageGenerationRequest,
    MessageGenerationResponse,
    SchemaGenerationResponse,
} from '@/types/api_types/aiGenerationSchemas'
import { DatasetListResponse, DatasetResponse } from '@/types/api_types/datasetSchemas'
import { EvalRunRequest, EvalRunResponse } from '@/types/api_types/evalSchemas'
import { NodeTypeSchema } from '@/types/api_types/nodeTypeSchemas'
import { OutputFileResponse } from '@/types/api_types/outputFileSchemas'
import {
    PauseHistoryResponse,
    PausedWorkflowResponse,
    ResumeActionRequest,
} from '@/types/api_types/pausedWorkflowSchemas'
import {
    ChunkPreviewResponseSchema,
    ChunkTemplateSchema,
    DocumentCollectionCreateRequestSchema,
    DocumentCollectionResponseSchema,
    DocumentWithChunksSchema,
    ProcessingProgressSchema,
    VectorIndexCreateRequestSchema,
    VectorIndexResponseSchema,
} from '@/types/api_types/ragSchemas'
import { RunResponse, RunStatus } from '@/types/api_types/runSchemas'
import { SessionCreate, SessionListResponse, SessionResponse } from '@/types/api_types/sessionSchemas'
import { UserCreate, UserListResponse, UserResponse, UserUpdate } from '@/types/api_types/userSchemas'
import {
    WorkflowCreateRequest,
    WorkflowDefinition,
    WorkflowResponse,
    WorkflowVersionResponse,
    SpurType,
} from '@/types/api_types/workflowSchemas'

import JSPydanticModel from './JSPydanticModel'

// Import the JSPydanticModel class

const API_BASE_URL =
    typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}/api`
        : 'http://localhost:6080/api'

export interface ApiKey {
    name: string
    value: string
}

export const getNodeTypes = async (): Promise<{
    schema: Record<string, NodeTypeSchema>
    metadata: Record<string, any>
}> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/node/supported_types/`)

        const model = new JSPydanticModel(response.data)
        const schema = model.createObjectFromSchema()
        const metadata = model.getAllMetadata()

        return {
            schema,
            metadata,
        }
    } catch (error) {
        console.error('Error getting node types:', error)
        throw error
    }
}

export const runWorkflow = async (workflowData: WorkflowDefinition): Promise<any> => {
    try {
        // Save the workflow data to a file
        const blob = new Blob([JSON.stringify(workflowData, null, 2)], {
            type: 'application/json',
        })
        const url = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'workflowData.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        const response = await axios.post(`${API_BASE_URL}/run_workflow/`, workflowData)
        return response.data
    } catch (error) {
        console.error('Error running workflow:', error)
        throw error
    }
}

export const getRunStatus = async (runID: string): Promise<RunResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/run/${runID}/status/`)
        return response.data
    } catch (error) {
        console.error('Error getting run status:', error)
        throw error
    }
}

export const getRun = async (runID) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/run/${runID}/`)
        return response.data
    } catch (error) {
        console.error('Error getting run:', error)
        throw error
    }
}

export const getWorkflows = async (page: number = 1, pageSize: number = 10): Promise<WorkflowResponse[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wf/`, {
            params: {
                page,
                page_size: pageSize,
            },
        })
        return response.data
    } catch (error) {
        console.error('Error getting workflows:', error)
        throw error
    }
}

export const createWorkflow = async (workflowData: WorkflowCreateRequest): Promise<WorkflowResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/wf/`, workflowData)
        return response.data
    } catch (error) {
        console.error('Error creating workflow:', error)
        throw error
    }
}

export const updateWorkflow = async (
    workflowId: string,
    workflowData: WorkflowCreateRequest
): Promise<WorkflowResponse> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/wf/${workflowId}/`, workflowData)
        return response.data
    } catch (error) {
        console.error('Error updating workflow:', error)
        throw error
    }
}

export const resetWorkflow = async (workflowId: string): Promise<any> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/wf/${workflowId}/reset/`)
        return response.data
    } catch (error) {
        console.error('Error resetting workflow:', error)
        throw error
    }
}

export const startRun = async (
    workflowID: string,
    initialInputs: Record<string, any> = {},
    parentRunId: string | null = null,
    runType: string = 'interactive'
): Promise<any> => {
    try {
        const requestBody = {
            initial_inputs: initialInputs,
            parent_run_id: parentRunId,
        }
        const response = await axios.post(
            `${API_BASE_URL}/wf/${workflowID}/start_run/?run_type=${runType}`,
            requestBody
        )
        return response.data
    } catch (error) {
        console.error('Error starting run:', error)
        throw error
    }
}

export const startBatchRun = async (
    workflowID: string,
    datasetID: string,
    miniBatchSize: number = 10
): Promise<any> => {
    try {
        const requestBody = {
            dataset_id: datasetID,
            mini_batch_size: miniBatchSize,
        }
        const response = await axios.post(`${API_BASE_URL}/wf/${workflowID}/start_batch_run/`, requestBody)
        return response.data
    } catch (error) {
        console.error('Error starting batch run:', error)
        throw error
    }
}

export const getWorkflow = async (workflowID: string): Promise<WorkflowResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wf/${workflowID}/`)
        return response.data
    } catch (error) {
        console.error('Error getting workflow:', error)
        throw error
    }
}

export async function getWorkflowRuns(
    workflowId: string,
    page: number = 1,
    pageSize: number = 10,
    startDate?: Date,
    endDate?: Date,
    status?: RunStatus
): Promise<RunResponse[]> {
    let url = `${API_BASE_URL}/wf/${workflowId}/runs/?page=${page}&page_size=${pageSize}`

    // Add date filters if provided
    if (startDate) {
        url += `&start_date=${startDate.toISOString()}`
    }
    if (endDate) {
        url += `&end_date=${endDate.toISOString()}`
    }
    // Add status filter if provided
    if (status) {
        url += `&status=${status}`
    }

    try {
        const response = await axios.get(url)
        return response.data
    } catch (error) {
        console.error('Error fetching workflow runs:', error)
        throw error
    }
}

export const downloadOutputFile = async (outputFileID: string): Promise<void> => {
    try {
        const fileInfoResponse = await axios.get<OutputFileResponse>(`${API_BASE_URL}/of/${outputFileID}/`)
        const fileName = fileInfoResponse.data.file_name

        const response = await axios.get(`${API_BASE_URL}/of/${outputFileID}/download/`, {
            responseType: 'blob',
        })

        const url = window.URL.createObjectURL(new Blob([response.data]))
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', fileName)

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
    } catch (error) {
        console.error('Error downloading output file:', error)
        throw error
    }
}

export const getAllRuns = async (
    page: number = 1,
    pageSize: number = 10,
    parentOnly: boolean = true,
    runType: string = 'batch'
): Promise<any> => {
    try {
        const params = {
            page,
            page_size: pageSize,
            parent_only: parentOnly,
            run_type: runType,
        }
        const response = await axios.get(`${API_BASE_URL}/run/`, { params })
        return response.data
    } catch (error) {
        console.error('Error fetching runs:', error)
        throw error
    }
}

export const listApiKeys = async (): Promise<string[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/env-mgmt/`)
        return response.data
    } catch (error) {
        console.error('Error listing API keys:', error)
        throw error
    }
}

export const getApiKey = async (name: string): Promise<ApiKey> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/env-mgmt/${name}`)
        return response.data
    } catch (error) {
        console.error(`Error getting API key for ${name}:`, error)
        throw error
    }
}

export const setApiKey = async (name: string, value: string): Promise<any> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/env-mgmt/`, {
            name,
            value,
        })
        return response.data
    } catch (error) {
        console.error(`Error setting API key for ${name}:`, error)
        throw error
    }
}

export const deleteApiKey = async (name: string): Promise<any> => {
    try {
        const response = await axios.delete(`${API_BASE_URL}/env-mgmt/${name}`)
        return response.data
    } catch (error) {
        console.error(`Error deleting API key for ${name}:`, error)
        throw error
    }
}

export const uploadDataset = async (name: string, description: string, file: File): Promise<DatasetResponse> => {
    try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await axios.post(
            `${API_BASE_URL}/ds/?name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}`,
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        )
        return response.data
    } catch (error) {
        console.error('Error uploading dataset:', error)
        throw error
    }
}

export const listDatasets = async (): Promise<DatasetListResponse> => {
    try {
        const response = await axios.get<DatasetListResponse>(`${API_BASE_URL}/ds/`)
        return response.data
    } catch (error) {
        console.error('Error listing datasets:', error)
        throw error
    }
}

export const getDataset = async (datasetId: string): Promise<DatasetResponse> => {
    try {
        const response = await axios.get<DatasetResponse>(`${API_BASE_URL}/ds/${datasetId}/`)
        return response.data
    } catch (error) {
        console.error(`Error getting dataset with ID ${datasetId}:`, error)
        throw error
    }
}

export const deleteDataset = async (datasetId: string): Promise<any> => {
    try {
        const response = await axios.delete(`${API_BASE_URL}/ds/${datasetId}/`)
        return response.data
    } catch (error) {
        console.error(`Error deleting dataset with ID ${datasetId}:`, error)
        throw error
    }
}

export const listDatasetRuns = async (datasetId: string): Promise<any> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/ds/${datasetId}/list_runs/`)
        return response.data
    } catch (error) {
        console.error(`Error listing runs for dataset with ID ${datasetId}:`, error)
        throw error
    }
}

export const deleteWorkflow = async (workflowId: string): Promise<number> => {
    try {
        const response = await axios.delete(`${API_BASE_URL}/wf/${workflowId}/`)
        return response.status // Should return 204 No Content
    } catch (error) {
        console.error('Error deleting workflow:', error)
        throw error
    }
}

export const getTemplates = async (): Promise<any> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/templates/`)
        return response.data
    } catch (error) {
        console.error('Error getting templates:', error)
        throw error
    }
}

export const instantiateTemplate = async (template: any): Promise<any> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/templates/instantiate/`, template)
        return response.data
    } catch (error) {
        console.error('Error instantiating template:', error)
        throw error
    }
}

export const duplicateWorkflow = async (workflowId: string): Promise<WorkflowResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/wf/${workflowId}/duplicate/`)
        return response.data
    } catch (error) {
        console.error('Error duplicating workflow:', error)
        throw error
    }
}

export const runPartialWorkflow = async (
    workflowId: string,
    nodeId: string,
    initialInputs: Record<string, any>,
    partialOutputs: Record<string, any>,
    rerunPredecessors: boolean
): Promise<any> => {
    try {
        const requestBody = {
            node_id: nodeId,
            initial_inputs: initialInputs,
            partial_outputs: partialOutputs,
            rerun_predecessors: rerunPredecessors,
        }
        const response = await axios.post(`${API_BASE_URL}/wf/${workflowId}/run_partial/`, requestBody)
        return response.data
    } catch (error) {
        console.error('Error running partial workflow:', error)
        throw error
    }
}

export const getEvals = async (): Promise<any> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/evals/`)
        return response.data
    } catch (error) {
        console.error('Error fetching evals:', error)
        throw error
    }
}

export const startEvalRun = async (
    workflowId: string,
    evalName: string,
    outputVariable: string,
    numSamples: number = 10
): Promise<EvalRunResponse> => {
    try {
        const request: EvalRunRequest = {
            workflow_id: workflowId,
            eval_name: evalName,
            output_variable: outputVariable,
            num_samples: numSamples,
        }
        const response = await axios.post<EvalRunResponse>(`${API_BASE_URL}/evals/launch/`, request)
        return response.data
    } catch (error) {
        console.error('Error starting eval run:', error)
        throw error
    }
}

export const getEvalRunStatus = async (evalRunId: string): Promise<EvalRunResponse> => {
    try {
        const response = await axios.get<EvalRunResponse>(`${API_BASE_URL}/evals/runs/${evalRunId}`)
        return response.data
    } catch (error) {
        console.error('Error fetching eval run status:', error)
        throw error
    }
}

export const listEvalRuns = async (): Promise<EvalRunResponse[]> => {
    try {
        const response = await axios.get<EvalRunResponse[]>(`${API_BASE_URL}/evals/runs/`)
        return response.data
    } catch (error) {
        console.error('Error listing eval runs:', error)
        throw error
    }
}

export const getWorkflowOutputVariables = async (workflowId: string): Promise<any> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wf/${workflowId}/output_variables/`)
        return response.data
    } catch (error) {
        console.error(`Error fetching output variables for workflow ${workflowId}:`, error)
        throw error
    }
}

export const getWorkflowVersions = async (
    workflowId: string,
    page: number = 1,
    pageSize: number = 10
): Promise<WorkflowVersionResponse[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wf/${workflowId}/versions/`, {
            params: {
                page,
                page_size: pageSize,
            },
        })
        return response.data
    } catch (error) {
        console.error(`Error fetching versions for workflow ${workflowId}:`, error)
        throw error
    }
}

export interface StoreGoogleAccessTokenResponse {
    message: string
}

export const storeGoogleAccessToken = async (accessToken: string, expiresIn: string): Promise<any> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/google/store_token/`, {
            access_token: accessToken,
            expires_in: expiresIn,
        })
        return response.data
    } catch (error) {
        console.error('Error storing token:', error)
        throw error
    }
}

export interface GoogleAccessTokenValidationResponse {
    is_valid: boolean
}

export const validateGoogleAccessToken = async (): Promise<GoogleAccessTokenValidationResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/google/validate_token/`)
        return response.data
    } catch (error) {
        console.error('Error checking token:', error)
        throw error
    }
}

// RAG Management Types
export interface KnowledgeBaseCreationJob {
    id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    progress: number
    current_step: string
    total_files: number
    processed_files: number
    total_chunks: number
    processed_chunks: number
    error_message?: string
    created_at: string
    updated_at: string
}

export interface KnowledgeBaseCreateRequest {
    name: string
    description?: string
    data_source: {
        type: 'upload' | 'sync'
        tool?: string
        files?: File[]
    }
    text_processing: {
        chunk_size: number
        overlap: number
    }
    embedding: {
        model: string
        vector_db: string
        search_strategy: string
        semantic_weight?: number
        keyword_weight?: number
        top_k?: number
        score_threshold?: number
    }
}

export interface KnowledgeBaseResponse {
    id: string
    name: string
    description: string
    status: 'processing' | 'ready' | 'failed'
    created_at: string
    updated_at: string
    document_count: number
    chunk_count: number
    error_message?: string
    has_embeddings: boolean
    config?: {
        vector_db?: string
        embedding_model?: string
        chunk_token_size?: number
        embeddings_batch_size?: number
    }
}

// Embedding Model Types
export interface EmbeddingModelConfig {
    id: string
    provider: string
    name: string
    dimensions: number
    max_input_length: number
    supported_encoding_formats?: string[]
    required_env_vars: string[]
}

// Vector Store Types
export interface VectorStoreConfig {
    id: string
    name: string
    description: string
    requires_api_key: boolean
    api_key_env_var?: string
    required_env_vars: string[]
}

// RAG Management Functions
export const createKnowledgeBase = async (data: KnowledgeBaseCreateRequest): Promise<KnowledgeBaseResponse> => {
    try {
        const formData = new FormData()

        // Add metadata
        formData.append(
            'metadata',
            JSON.stringify({
                name: data.name,
                description: data.description,
                text_processing: data.text_processing,
                embedding: data.embedding,
            })
        )

        // Add files if present
        if (data.data_source?.type === 'upload' && data.data_source.files) {
            data.data_source.files.forEach((file) => {
                formData.append('files', file)
            })
        }

        // Add sync tool info if present
        if (data.data_source?.type === 'sync' && data.data_source.tool) {
            formData.append('sync_tool', data.data_source.tool)
        }

        const response = await axios.post(`${API_BASE_URL}/rag/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
        return response.data
    } catch (error) {
        console.error('Error creating knowledge base:', error)
        throw error
    }
}

export const listKnowledgeBases = async (): Promise<KnowledgeBaseResponse[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/`)
        return response.data
    } catch (error) {
        console.error('Error listing knowledge bases:', error)
        throw error
    }
}

export const getKnowledgeBase = async (id: string): Promise<KnowledgeBaseResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/${id}/`)
        return response.data
    } catch (error) {
        console.error('Error getting knowledge base:', error)
        throw error
    }
}

export const deleteKnowledgeBase = async (id: string): Promise<void> => {
    try {
        await axios.delete(`${API_BASE_URL}/rag/${id}/`)
    } catch (error) {
        console.error('Error deleting knowledge base:', error)
        throw error
    }
}

export const updateKnowledgeBase = async (
    id: string,
    data: Partial<KnowledgeBaseCreateRequest>
): Promise<KnowledgeBaseResponse> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/rag/${id}/`, data)
        return response.data
    } catch (error) {
        console.error('Error updating knowledge base:', error)
        throw error
    }
}

export const syncKnowledgeBase = async (id: string): Promise<void> => {
    try {
        await axios.post(`${API_BASE_URL}/rag/${id}/sync/`)
    } catch (error) {
        console.error('Error syncing knowledge base:', error)
        throw error
    }
}

export const getEmbeddingModels = async (): Promise<Record<string, EmbeddingModelConfig>> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/env-mgmt/embedding-models/`)
        return response.data
    } catch (error) {
        console.error('Error fetching embedding models:', error)
        throw error
    }
}

export const getVectorStores = async (): Promise<Record<string, VectorStoreConfig>> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/env-mgmt/vector-stores/`)
        return response.data
    } catch (error) {
        console.error('Error fetching vector stores:', error)
        throw error
    }
}

export const getKnowledgeBaseJobStatus = async (id: string): Promise<KnowledgeBaseCreationJob> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/${id}/job/`)
        return response.data
    } catch (error) {
        console.error('Error getting knowledge base job status:', error)
        throw error
    }
}

export const addDocumentsToKnowledgeBase = async (id: string, files: File[]): Promise<any> => {
    try {
        const formData = new FormData()
        files.forEach((file) => {
            formData.append('files', file)
        })

        const response = await axios.post(`${API_BASE_URL}/rag/${id}/documents/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
        return response.data
    } catch (error) {
        console.error('Error adding documents to knowledge base:', error)
        throw error
    }
}

// Document Collection Types
export interface DocumentCollectionCreateRequest {
    name: string
    description?: string
    text_processing: {
        chunk_token_size: number
        min_chunk_size_chars: number
        min_chunk_length_to_embed: number
        embeddings_batch_size: number
        max_num_chunks: number
        use_vision_model: boolean
        vision_model?: string
        vision_provider?: string
        template?: {
            enabled: boolean
            template: string
            metadata_template: Record<string, string>
        }
    }
}

export interface DocumentCollectionResponse {
    id: string
    name: string
    description?: string
    status: 'processing' | 'ready' | 'failed'
    created_at: string
    updated_at: string
    document_count: number
    chunk_count: number
    error_message?: string
}

// Vector Index Types
export interface VectorIndexCreateRequest {
    name: string
    description?: string
    collection_id: string
    embedding: {
        model: string
        vector_db: string
        search_strategy: string
        semantic_weight?: number
        keyword_weight?: number
        top_k?: number
        score_threshold?: number
    }
}

export interface VectorIndexResponse {
    id: string
    name: string
    description?: string
    collection_id: string
    status: 'processing' | 'ready' | 'failed'
    created_at: string
    updated_at: string
    document_count: number
    chunk_count: number
    error_message?: string
    embedding_model: string
    vector_db: string
}

// Document Collection Functions
export const createDocumentCollection = async (
    data: DocumentCollectionCreateRequestSchema,
    files?: File[]
): Promise<DocumentCollectionResponseSchema> => {
    try {
        const formData = new FormData()

        // Add metadata
        formData.append('metadata', JSON.stringify(data))

        // Add files if present
        if (files) {
            files.forEach((file) => {
                formData.append('files', file)
            })
        }

        const response = await axios.post(`${API_BASE_URL}/rag/collections/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
        return response.data
    } catch (error) {
        console.error('Error creating document collection:', error)
        throw error
    }
}

export const listDocumentCollections = async (): Promise<DocumentCollectionResponseSchema[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/collections/`)
        return response.data
    } catch (error) {
        console.error('Error listing document collections:', error)
        throw error
    }
}

export const getDocumentCollection = async (id: string): Promise<DocumentCollectionResponseSchema> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/collections/${id}/`)
        return response.data
    } catch (error) {
        console.error('Error getting document collection:', error)
        throw error
    }
}

export const deleteDocumentCollection = async (id: string): Promise<void> => {
    try {
        await axios.delete(`${API_BASE_URL}/rag/collections/${id}/`)
    } catch (error) {
        console.error('Error deleting document collection:', error)
        throw error
    }
}

export const addDocumentsToCollection = async (id: string, files: File[]): Promise<any> => {
    try {
        const formData = new FormData()
        files.forEach((file) => {
            formData.append('files', file)
        })

        const response = await axios.post(`${API_BASE_URL}/rag/collections/${id}/documents/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
        return response.data
    } catch (error) {
        console.error('Error adding documents to collection:', error)
        throw error
    }
}

// Vector Index Functions
export const createVectorIndex = async (data: VectorIndexCreateRequestSchema): Promise<VectorIndexResponseSchema> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/rag/indices/`, data)
        return response.data
    } catch (error) {
        console.error('Error creating vector index:', error)
        throw error
    }
}

export const listVectorIndices = async (): Promise<VectorIndexResponseSchema[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/indices/`)
        return response.data
    } catch (error) {
        console.error('Error listing vector indices:', error)
        throw error
    }
}

export const getVectorIndex = async (id: string): Promise<VectorIndexResponseSchema> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/indices/${id}/`)
        return response.data
    } catch (error) {
        console.error('Error getting vector index:', error)
        throw error
    }
}

export const deleteVectorIndex = async (id: string): Promise<void> => {
    try {
        await axios.delete(`${API_BASE_URL}/rag/indices/${id}/`)
    } catch (error) {
        console.error('Error deleting vector index:', error)
        throw error
    }
}

export const getCollectionDocuments = async (id: string): Promise<DocumentWithChunksSchema[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/rag/collections/${id}/documents/`)
        return response.data
    } catch (error) {
        console.error('Error getting collection documents:', error)
        throw error
    }
}

export const getIndexProgress = async (indexId: string): Promise<ProcessingProgressSchema | null> => {
    try {
        const response = await axios.get<ProcessingProgressSchema>(`${API_BASE_URL}/rag/indices/${indexId}/progress/`)
        return response.data
    } catch (error: any) {
        // For 404, return null instead of throwing
        if (error.response?.status === 404) {
            return null
        }
        // For other errors, throw
        throw error
    }
}

export const previewChunk = async (
    file: File,
    config: {
        chunk_token_size: number
        min_chunk_size_chars: number
        min_chunk_length_to_embed: number
        template: ChunkTemplateSchema
    }
): Promise<ChunkPreviewResponseSchema> => {
    try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append(
            'chunking_config',
            JSON.stringify({
                chunk_token_size: config.chunk_token_size,
                min_chunk_size_chars: config.min_chunk_size_chars,
                min_chunk_length_to_embed: config.min_chunk_length_to_embed,
                template: config.template,
            })
        )

        const response = await axios.post(`${API_BASE_URL}/rag/collections/preview_chunk/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
        return response.data
    } catch (error) {
        console.error('Error previewing chunk:', error)
        throw error
    }
}

export const uploadTestFiles = async (
    workflowId: string,
    nodeId: string,
    files: File[]
): Promise<Record<string, string[]>> => {
    try {
        const formData = new FormData()
        formData.append('workflow_id', workflowId)
        formData.append('node_id', nodeId)
        files.forEach((file) => {
            formData.append('files', file)
        })

        const response = await axios.post(`${API_BASE_URL}/wf/upload_test_files/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
        return response.data
    } catch (error) {
        console.error('Error uploading test files:', error)
        throw error
    }
}

// Add new functions for paused workflows
export const listPausedWorkflows = async (
    page: number = 1,
    pageSize: number = 10
): Promise<PausedWorkflowResponse[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wf/paused_workflows/`, {
            params: { page, page_size: pageSize },
        })
        return response.data
    } catch (error) {
        console.error('Error listing paused workflows:', error)
        throw error
    }
}

export const getPauseHistory = async (runId: string): Promise<PauseHistoryResponse[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wf/pause_history/${runId}/`)
        return response.data
    } catch (error) {
        console.error('Error getting pause history:', error)
        throw error
    }
}

/**
 * Take action on a paused workflow
 */
export const takePauseAction = async (runId: string, actionRequest: ResumeActionRequest): Promise<RunResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/wf/process_pause_action/${runId}/`, actionRequest)
        return response.data
    } catch (error) {
        console.error('Error taking action on paused workflow:', error)
        throw error
    }
}

/**
 * Cancel a workflow that is awaiting human approval
 */
export const cancelWorkflow = async (runId: string): Promise<RunResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/wf/cancel_workflow/${runId}/`)
        return response.data
    } catch (error) {
        console.error('Error canceling workflow:', error)
        throw error
    }
}

export const generateSchema = async (
    description: string,
    existingSchema?: string
): Promise<SchemaGenerationResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/ai/generate_schema/`, {
            description,
            existing_schema: existingSchema,
        })
        return response.data
    } catch (error) {
        console.error('Error generating schema:', error)
        throw error
    }
}

export const generateMessage = async (request: MessageGenerationRequest): Promise<MessageGenerationResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/ai/generate_message/`, request)
        return response.data
    } catch (error) {
        console.error('Error generating message:', error)
        throw error
    }
}

// User Management Functions
export const createUser = async (userData: UserCreate): Promise<UserResponse> => {
    try {
        // Example usage:
        // const user = await createUser({
        //     external_id: "user123",
        //     user_metadata: { name: "John Doe" }
        // });
        const response = await axios.post(`${API_BASE_URL}/user/`, userData)
        return response.data
    } catch (error) {
        console.error('Error creating user:', error)
        throw error
    }
}

export const listUsers = async (skip: number = 0, limit: number = 10): Promise<UserListResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/user/`, {
            params: { skip, limit },
        })
        return response.data
    } catch (error) {
        console.error('Error listing users:', error)
        throw error
    }
}

export const getUser = async (userId: string): Promise<UserResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/user/${userId}/`)
        return response.data
    } catch (error) {
        console.error('Error getting user:', error)
        throw error
    }
}

export const updateUser = async (userId: string, userData: UserUpdate): Promise<UserResponse> => {
    try {
        const response = await axios.patch(`${API_BASE_URL}/user/${userId}/`, userData)
        return response.data
    } catch (error) {
        console.error('Error updating user:', error)
        throw error
    }
}

export const deleteUser = async (userId: string): Promise<void> => {
    try {
        await axios.delete(`${API_BASE_URL}/user/${userId}/`)
    } catch (error) {
        console.error('Error deleting user:', error)
        throw error
    }
}

// Session Management Functions
export const createSession = async (sessionData: SessionCreate): Promise<SessionResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/session/`, sessionData)
        return response.data
    } catch (error) {
        console.error('Error creating session:', error)
        throw error
    }
}

export const listSessions = async (
    skip: number = 0,
    limit: number = 10,
    userId?: string
): Promise<SessionListResponse> => {
    try {
        const params: Record<string, any> = { skip, limit }
        if (userId) {
            params.user_id = userId
        }
        const response = await axios.get(`${API_BASE_URL}/session/`, { params })
        return response.data
    } catch (error) {
        console.error('Error listing sessions:', error)
        throw error
    }
}

export const getSession = async (sessionId: string): Promise<SessionResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/session/${sessionId}/`)
        return response.data
    } catch (error) {
        console.error('Error getting session:', error)
        throw error
    }
}

export const deleteSession = async (sessionId: string): Promise<void> => {
    try {
        await axios.delete(`${API_BASE_URL}/session/${sessionId}/`)
    } catch (error) {
        console.error('Error deleting session:', error)
        throw error
    }
}

export const createTestSession = async (workflowId: string): Promise<SessionResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/session/test/?workflow_id=${workflowId}`)
        return response.data
    } catch (error) {
        console.error('Error creating test session:', error)
        throw error
    }
}

// Slack Integration Types
export interface SlackAgent {
    id: number
    name: string
    slack_team_id: string
    slack_team_name: string
    workflow_id?: string
    spur_type: SpurType
    is_active: boolean
    trigger_enabled: boolean
    trigger_on_mention: boolean
    trigger_on_direct_message: boolean
    trigger_on_channel_message: boolean
    trigger_keywords?: string[]
    created_at: string
    has_bot_token: boolean
    has_user_token: boolean
    has_app_token?: boolean
    last_token_update?: string
    socket_mode_enabled?: boolean
}

export interface SlackOAuthResponse {
    success: boolean
    message: string
    team_name?: string
}

export interface SlackMessageResponse {
    success: boolean
    message: string
    ts?: string
}

// Slack Integration Functions
export const getSlackAuthUrl = async (): Promise<{ auth_url: string }> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/slack/oauth/authorize`)
        return response.data
    } catch (error) {
        console.error('Error getting Slack auth URL:', error)
        throw error
    }
}

export const getSlackRequiredKeys = async (): Promise<{
    configured: boolean;
    keys: Array<{
        name: string;
        description: string;
        configured: boolean;
        masked_value: string;
        required: boolean;
        purpose: string;
        help_url: string;
    }>;
}> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/slack/required-keys`)
        return response.data
    } catch (error) {
        console.error('Error getting Slack required keys:', error)
        throw error
    }
}

/**
 * Fetches Slack setup information including required keys and their configuration status
 * @returns The Slack setup information object or null if there was an error
 */
export const fetchSlackSetupInfo = async (): Promise<{
    configured: boolean;
    keys: Array<{
        name: string;
        description: string;
        configured: boolean;
        masked_value: string;
        required: boolean;
        purpose: string;
        help_url: string;
    }>;
} | null> => {
    try {
        const info = await getSlackRequiredKeys()
        return info
    } catch (error) {
        console.error('Error fetching Slack setup info:', error)
        return null
    }
}

export const getSlackAgents = async (forceRefresh = false): Promise<SlackAgent[]> => {
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Add cache-busting parameter to ensure we get fresh data
            const cacheBuster = forceRefresh || attempt > 1 ? `?_=${Date.now()}` : '';
            console.log(`Fetching Slack agents (attempt ${attempt}/${maxRetries})${forceRefresh ? ' with force refresh' : ''}`);

            const response = await axios.get(`${API_BASE_URL}/slack/agents${cacheBuster}`);

            if (!response.data) {
                throw new Error('No data returned from server');
            }

            // Process agents to ensure proper spur_type values
            const processedAgents = response.data.map(agent => {
                // Log the original spur_type for debugging
                console.log(`Agent ${agent.id} (${agent.name}) has spur_type:`, agent.spur_type);

                // Ensure spur_type is a valid value
                if (!agent.spur_type ||
                    (agent.spur_type !== SpurType.AGENT &&
                     agent.spur_type !== SpurType.CHATBOT &&
                     agent.spur_type !== SpurType.WORKFLOW)) {
                    console.warn(`Agent ${agent.id} has invalid spur_type:`, agent.spur_type);
                    // Set a default spur_type
                    return {
                        ...agent,
                        spur_type: SpurType.AGENT
                    };
                }

                return agent;
            });

            console.log(`Retrieved ${processedAgents.length} Slack agents`);
            return processedAgents;
        } catch (error) {
            console.error(`Error fetching Slack agents (attempt ${attempt}/${maxRetries}):`, error);
            lastError = error;

            if (attempt < maxRetries) {
                // Wait before retrying with increasing delay
                await new Promise(resolve => setTimeout(resolve, 300 * attempt));
            }
        }
    }

    // Return empty array instead of throwing to prevent UI crashes
    console.warn('Returning empty array after failed Slack agents fetch attempts');
    return [];
}

export const associateWorkflow = async (agentId: number, workflowId: string): Promise<SlackAgent> => {
    const maxRetries = 3;
    const waitBetweenRetries = 500; // ms
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Associating workflow (attempt ${attempt}/${maxRetries}):`, { agentId, workflowId, workflowIdType: typeof workflowId });

            // Special handling for empty workflowId (dissociation)
            if (!workflowId || workflowId === "null" || workflowId === "undefined") {
                console.log('Workflow ID is empty, this will remove the workflow association');
                workflowId = null; // Ensure null is sent if workflowId is falsy
            }

            // Send the API request
            const response = await axios.put(`${API_BASE_URL}/slack/agents/${agentId}/workflow`, {
                workflow_id: workflowId
            });

            console.log('Workflow association response:', response.data);

            // Convert both IDs to strings for consistent comparison
            const expectedIdStr = workflowId ? String(workflowId) : "";
            const receivedIdStr = response.data.workflow_id ? String(response.data.workflow_id) : "";

            if (expectedIdStr && receivedIdStr && expectedIdStr !== receivedIdStr) {
                console.warn('Workflow association response mismatch:', {
                    expected: expectedIdStr,
                    received: receivedIdStr
                });

                // If it's the last attempt and we still have a mismatch, throw an error
                if (attempt === maxRetries) {
                    throw new Error('Server returned a different workflow ID than requested');
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, waitBetweenRetries));
                continue;
            }

            console.log('Workflow association successful:', response.data);
            return response.data;
        } catch (error) {
            console.error(`Error associating workflow (attempt ${attempt}/${maxRetries}):`, error);
            lastError = error;

            if (attempt < maxRetries) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, waitBetweenRetries));
            }
        }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('Failed to associate workflow after multiple attempts');
}

export const updateTriggerConfig = async (
    agentId: number,
    config: {
        trigger_on_mention: boolean,
        trigger_on_direct_message: boolean,
        trigger_on_channel_message: boolean,
        trigger_keywords: string[],
        trigger_enabled: boolean
    }
): Promise<SlackAgent> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/slack/agents/${agentId}/trigger-config`, config)
        return response.data
    } catch (error) {
        console.error('Error updating agent trigger configuration:', error)
        throw error
    }
}

export const sendTestMessage = async (channel: string, text: string, agentId?: number): Promise<SlackMessageResponse> => {
    try {
        // Build the URL with the required query parameters
        let url = `${API_BASE_URL}/slack/test-message?channel=${encodeURIComponent(channel)}`;
        if (agentId) {
            url += `&agent_id=${agentId}`;
        }

        const response = await axios.post(url, {
            text
        })
        return response.data
    } catch (error: any) {
        console.error('Error sending test message:', error)

        // Check for specific installation unavailable errors
        if (error.response?.data?.detail && (
            error.response.data.detail.includes('installation') ||
            error.response.data.detail.includes('reinstall') ||
            error.response.data.detail.includes('AuthorizeResult')
        )) {
            return {
                success: false,
                message: 'Your Slack installation is no longer available. Please reinstall the app to reconnect.'
            }
        }

        throw error
    }
}

export const handleSlackCallback = async (code: string): Promise<SlackOAuthResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/slack/oauth/callback?code=${code}`)
        return response.data
    } catch (error) {
        console.error('Error handling Slack callback:', error)
        throw error
    }
}

export const checkSlackConfig = async (): Promise<boolean> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/slack/config/status`)
        return response.data.configured
    } catch (error) {
        return false
    }
}

// Higher-level Slack handler functions
export interface AlertFunction {
    (message: string, color: 'success' | 'danger' | 'warning' | 'default'): void;
}

export const connectToSlack = async (onAlert?: AlertFunction): Promise<void> => {
    try {
        // Get the Slack auth URL
        const response = await getSlackAuthUrl()
        if (response.auth_url) {
            // Open the auth URL in a new window/tab
            window.open(response.auth_url, '_blank')
        } else {
            onAlert?.('Failed to get Slack authorization URL', 'danger')
        }
    } catch (error: any) {
        console.error('Error connecting to Slack:', error)
        // Let the error propagate to the caller for custom handling
        throw error
    }
}

export const toggleSlackTrigger = async (
    agentId: number,
    field: string,
    value: boolean,
    agents: SlackAgent[],
    updateAgentsCallback: (updater: (agents: SlackAgent[]) => SlackAgent[]) => void,
    onAlert?: AlertFunction
): Promise<void> => {
    try {
        // Find the current agent
        const agent = agents.find(a => a.id === agentId)
        if (!agent) return

        // Update trigger configuration
        const config = {
            trigger_on_mention: field === 'trigger_on_mention' ? value : agent.trigger_on_mention,
            trigger_on_direct_message: field === 'trigger_on_direct_message' ? value : agent.trigger_on_direct_message,
            trigger_on_channel_message: field === 'trigger_on_channel_message' ? value : agent.trigger_on_channel_message,
            trigger_keywords: agent.trigger_keywords || [],
            trigger_enabled: field === 'trigger_enabled' ? value : agent.trigger_enabled
        }

        const updatedAgent = await updateTriggerConfig(agentId, config)

        // Update local state
        updateAgentsCallback(agents =>
            agents.map(a => a.id === agentId ? updatedAgent : a)
        )

        onAlert?.('Agent trigger settings updated successfully!', 'success')
    } catch (error) {
        console.error('Error updating agent trigger configuration:', error)
        onAlert?.('Failed to update agent configuration', 'danger')
    }
}

/**
 * Set the Slack bot token
 */
export const setSlackToken = async (botToken: string): Promise<SlackOAuthResponse> => {
    try {
        console.log('Setting Slack bot token...')
        const response = await axios.post(`${API_BASE_URL}/slack/set-token`, {
            token: botToken
        })

        console.log('Slack token response:', response.data)
        return response.data
    } catch (error) {
        console.error('Error setting Slack token:', error)
        throw error
    }
}

/**
 * Create a custom Slack agent with the specified name and configuration
 */
export const createSlackAgent = async (
    name: string,
    config: {
        trigger_on_mention?: boolean;
        trigger_on_direct_message?: boolean;
        trigger_on_channel_message?: boolean;
        trigger_keywords?: string[];
        trigger_enabled?: boolean;
        workflow_id: string; // Required - must be associated with a workflow
        spur_type?: SpurType;
        bot_token?: string;  // Slack bot token (xoxb-...)
        user_token?: string; // Slack user token (xoxp-...)
        app_token?: string;  // Slack app-level token (xapp-...)
    }
): Promise<SlackAgent | null> => {
    try {
        console.log('Creating custom Slack agent:', name)

        if (!config.workflow_id) {
            console.error('Cannot create a Slack agent without a workflow_id');
            return null;
        }

        // Extract tokens from config before sending to API
        const { bot_token, user_token, app_token, ...agentConfig } = config;

        // Create the agent with configuration (excluding tokens)
        const response = await axios.post(`${API_BASE_URL}/slack/agents`, {
            name,
            spur_type: config.spur_type || SpurType.AGENT,
            ...agentConfig
        })

        const agent = response.data;
        console.log('Created custom agent:', agent)

        // Save tokens separately after agent creation
        if (bot_token || user_token || app_token) {
            console.log('Setting tokens for agent:', agent.id);

            // Save each token with individual API calls
            const tokenSavePromises = [];

            if (bot_token?.trim()) {
                console.log('Setting bot token');
                tokenSavePromises.push(
                    axios.post(`${API_BASE_URL}/slack/agents/${agent.id}/tokens/bot_token`, {
                        token: bot_token.trim()
                    })
                );
            }

            if (user_token?.trim()) {
                console.log('Setting user token');
                tokenSavePromises.push(
                    axios.post(`${API_BASE_URL}/slack/agents/${agent.id}/tokens/user_token`, {
                        token: user_token.trim()
                    })
                );
            }

            if (app_token?.trim()) {
                console.log('Setting app token');
                tokenSavePromises.push(
                    axios.post(`${API_BASE_URL}/slack/agents/${agent.id}/tokens/app_token`, {
                        token: app_token.trim()
                    })
                );
            }

            try {
                await Promise.all(tokenSavePromises);
                console.log('All tokens set successfully');

                // Refresh the agent data to include updated token flags
                const updatedAgentResponse = await axios.get(`${API_BASE_URL}/slack/agents/${agent.id}`);
                return updatedAgentResponse.data;
            } catch (tokenError) {
                console.error('Error setting tokens:', tokenError);
                // Still return the agent even if token setting fails
            }
        }

        return agent;
    } catch (error) {
        console.error('Error creating custom Slack agent:', error)
        return null
    }
}

/**
 * Delete a Slack agent by ID
 */
export const deleteSlackAgent = async (
    agentId: number,
    onAlert?: AlertFunction
): Promise<boolean> => {
    try {
        console.log('Deleting Slack agent:', agentId)

        const response = await axios.delete(`${API_BASE_URL}/slack/agents/${agentId}`)

        if (response.status === 204) {
            onAlert?.('Slack agent deleted successfully!', 'success')
            return true
        } else {
            throw new Error('Unexpected response status: ' + response.status)
        }
    } catch (error) {
        console.error('Error deleting Slack agent:', error)
        onAlert?.('Failed to delete Slack agent', 'danger')
        return false
    }
}

export interface SlackSocketModeResponse {
    agent_id: number;
    socket_mode_active: boolean;
    message: string;
}

// Shared error handling for Socket Mode operations
const handleSocketModeError = (error: any, operation: string): { error: true; errorType: string; message: string; originalError?: any } => {
    console.error(`Error ${operation}:`, error);

    // Handle app token errors
    if (error?.response?.data?.detail?.includes('SLACK_APP_TOKEN') ||
        error?.response?.data?.detail?.includes('not_allowed_token_type')) {
        return {
            error: true,
            errorType: "SocketModeTokenError",
            message: "Socket Mode requires an app-level token (SLACK_APP_TOKEN) that starts with 'xapp-'. " +
                    "Please configure this token in your environment variables. " +
                    "You can generate one from your Slack App settings under 'Basic Information' → 'App-Level Tokens'.",
            originalError: error
        };
    }

    // Handle 500 errors
    if (error?.response?.status === 500) {
        const errorDetail = error?.response?.data?.detail || '';
        if (errorDetail.includes('token') || errorDetail.includes('xapp-') || errorDetail.includes('not_allowed_token_type')) {
            return {
                error: true,
                errorType: "SocketModeTokenError",
                message: "Socket Mode requires an app-level token (SLACK_APP_TOKEN) that starts with 'xapp-', " +
                        "not a bot token. Please configure the correct token type in your environment variables.",
                originalError: error
            };
        }
        return {
            error: true,
            errorType: "SocketModeServerError",
            message: `Server error occurred when ${operation}: ${errorDetail || 'Unknown server error'}`,
            originalError: error
        };
    }

    // Generic error handler
    return {
        error: true,
        errorType: "UnknownError",
        message: error?.message || `An unknown error occurred when ${operation}`,
        originalError: error
    };
};

/**
 * Start Socket Mode for a Slack agent
 */
export const startSocketMode = async (
    agentId: number
): Promise<SlackSocketModeResponse | { error: true; errorType: string; message: string; originalError?: any }> => {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/slack/agents/${agentId}/socket-mode/start`
        );
        return response.data;
    } catch (error: any) {
        return handleSocketModeError(error, 'starting Socket Mode');
    }
};

/**
 * Stop Socket Mode for a Slack agent
 */
export const stopSocketMode = async (
    agentId: number
): Promise<SlackSocketModeResponse | { error: true; errorType: string; message: string; originalError?: any }> => {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/slack/agents/${agentId}/socket-mode/stop`
        );
        return response.data;
    } catch (error: any) {
        return handleSocketModeError(error, 'stopping Socket Mode');
    }
};

/**
 * Get Socket Mode status for a Slack agent
 */
export const getSocketModeStatus = async (
    agentId: number
): Promise<SlackSocketModeResponse | { error: true; errorType: string; message: string; originalError?: any }> => {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/slack/agents/${agentId}/socket-mode/status`
        );
        return response.data;
    } catch (error: any) {
        return handleSocketModeError(error, 'getting Socket Mode status');
    }
};

/**
 * Fetch a masked token for a Slack agent
 */
export const fetchMaskedToken = async (agentId: number, tokenType: string): Promise<{
    masked_token: string;
    updated_at: string;
}> => {
    const url = `${API_BASE_URL}/slack/agents/${agentId}/tokens/${tokenType}`
    console.log(`Fetching masked token from: ${url}`)

    try {
        const response = await axios.get(url)
        console.log(`Received masked token response for ${tokenType}:`, response.data)
        return response.data
    } catch (error: any) {
        console.error(`Error fetching ${tokenType}:`, error.response || error)
        if (error.response?.status === 404) {
            console.warn(`Token ${tokenType} for agent ${agentId} not found`)
        }
        throw error
    }
}

/**
 * Save Slack tokens for an agent
 */
export const saveSlackTokens = async (agentId: number, tokens: {
    bot_token?: string;
    user_token?: string;
    app_token?: string;
}): Promise<void> => {
    try {
        const requests = [];
        if (tokens.bot_token?.trim()) {
            requests.push(
                axios.post(`${API_BASE_URL}/slack/agents/${agentId}/tokens/bot_token`, {
                    token: tokens.bot_token
                })
            );
        }
        if (tokens.user_token?.trim()) {
            requests.push(
                axios.post(`${API_BASE_URL}/slack/agents/${agentId}/tokens/user_token`, {
                    token: tokens.user_token
                })
            );
        }
        if (tokens.app_token?.trim()) {
            requests.push(
                axios.post(`${API_BASE_URL}/slack/agents/${agentId}/tokens/app_token`, {
                    token: tokens.app_token
                })
            );
        }

        await Promise.all(requests);
    } catch (error) {
        console.error('Error saving tokens:', error);
        throw error;
    }
}

/**
 * Delete a Slack token for an agent
 */
export const deleteSlackToken = async (agentId: number, tokenType: string): Promise<void> => {
    try {
        await axios.delete(`${API_BASE_URL}/slack/agents/${agentId}/tokens/${tokenType}`)
    } catch (error) {
        console.error(`Error deleting ${tokenType}:`, error)
        throw error
    }
}

export const testSlackConnection = async (agentId: number): Promise<{
    success: boolean;
    message: string;
    team_id?: string;
    bot_id?: string;
    user_id?: string;
    error?: any;
}> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/slack/agents/${agentId}/test-connection`);
        return response.data;
    } catch (error) {
        console.error('Error testing Slack connection:', error);

        if (axios.isAxiosError(error) && error.response) {
            return {
                success: false,
                message: error.response.data?.detail || 'Failed to test Slack connection',
                error: error.response.data
            };
        }

        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error testing Slack connection',
            error
        };
    }
};
