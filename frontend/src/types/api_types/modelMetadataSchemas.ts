export interface FieldMetadata {
    enum?: string[]
    default?: any
    title?: string
    description?: string // Field description from the backend
    minimum?: number
    maximum?: number
    type?: string
    required?: boolean
    properties?: Record<string, FieldMetadata>
    template?: boolean // Flag to indicate if this field supports template variables
}

export interface ModelConstraints {
    max_tokens: number
    min_temperature: number
    max_temperature: number
    supports_JSON_output: boolean
    supports_max_tokens: boolean
    supports_temperature: boolean
    supports_thinking?: boolean
    thinking_budget_tokens?: number
    context_window?: number
    input_modalities?: string[]
    thinking_modes?: string[]
    pricing_usd_per_million_tokens?: Record<string, number | null>
    pricing_tiers_usd_per_million_tokens?: Array<Record<string, string | number | null>>
}

export interface ModelConstraintsMap {
    [modelId: string]: ModelConstraints
}
