export interface MessageGenerationRequest {
    description: string
    message_type: 'system' | 'user'
    existing_message?: string
    context?: string
    available_variables?: string[]
}

export interface MessageGenerationResponse {
    message: string
}

export interface SchemaGenerationRequest {
    description: string
    existing_schema?: string
}

export interface SchemaGenerationResponse {
    [key: string]: any
}
