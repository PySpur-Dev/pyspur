export interface MessageBase {
    content: Record<string, any>
}

export interface MessageResponse extends MessageBase {
    id: string
    session_id: string
    run_id?: string
    created_at: string
    updated_at: string
}

export interface SessionBase {
    workflow_id: string
}

export interface SessionCreate extends SessionBase {
    user_id: string
}

export interface SessionUpdate extends SessionBase {}

export interface SessionResponse extends SessionBase {
    id: string
    user_id: string
    created_at: string
    updated_at: string
    messages: MessageResponse[]
}

export interface SessionListResponse {
    sessions: SessionResponse[]
    total: number
}
