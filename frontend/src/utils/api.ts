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
import { RunResponse } from '@/types/api_types/runSchemas'
import {
    WorkflowCreateRequest,
    WorkflowDefinition,
    WorkflowResponse,
    WorkflowVersionResponse,
} from '@/types/api_types/workflowSchemas'
import axios from 'axios'
import JSPydanticModel from './JSPydanticModel' // Import the JSPydanticModel class

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

export const getWorkflowRuns = async (
    workflowID: string,
    page: number = 1,
    pageSize: number = 10
): Promise<RunResponse[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wf/${workflowID}/runs/`, {
            params: {
                page,
                page_size: pageSize,
            },
        })
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

export interface ToolListResponse {
    available_tools: string[];
    enabled_tools: string[];
}

export interface ToolFileResponse {
    success: boolean;
    message: string;
    data?: {
        filename: string;
        content: string;
    };
}

export const listTools = async (): Promise<ToolListResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/mcp/tools`)
        return {
            available_tools: response.data.available_tools || [],
            enabled_tools: response.data.enabled_tools || []
        }
    } catch (error) {
        console.error('Error listing tools:', error)
        throw error
    }
}

export const listToolFiles = async (): Promise<string[]> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/mcp/tools/files`)
        return response.data || []
    } catch (error) {
        console.error('Error listing tool files:', error)
        throw error
    }
}

export const getToolFile = async (filename: string): Promise<ToolFileResponse> => {
    try {
        const response = await axios.get(`${API_BASE_URL}/mcp/tools/files/${filename}`)
        return response.data
    } catch (error) {
        console.error('Error getting tool file:', error)
        throw error
    }
}

export const createToolFile = async (filename: string, content: string): Promise<ToolFileResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/mcp/tools/files`, {
            filename,
            content
        })
        return response.data
    } catch (error) {
        console.error('Error creating tool file:', error)
        throw error
    }
}

export const updateToolFile = async (filename: string, content: string): Promise<ToolFileResponse> => {
    try {
        const response = await axios.put(`${API_BASE_URL}/mcp/tools/files/${filename}`, {
            filename,
            content
        })
        return response.data
    } catch (error) {
        console.error('Error updating tool file:', error)
        throw error
    }
}

export const deleteToolFile = async (filename: string): Promise<ToolFileResponse> => {
    try {
        const response = await axios.delete(`${API_BASE_URL}/mcp/tools/files/${filename}`)
        return response.data
    } catch (error) {
        console.error('Error deleting tool file:', error)
        throw error
    }
}

export const registerNodesAsTools = async (workflowId: string): Promise<ToolFileResponse> => {
    try {
        const response = await axios.post(`${API_BASE_URL}/mcp/tools/register`, {
            workflow_id: workflowId
        })
        return response.data
    } catch (error) {
        console.error('Error registering nodes as tools:', error)
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
