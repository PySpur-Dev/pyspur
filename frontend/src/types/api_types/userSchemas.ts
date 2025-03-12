export interface UserBase {
    external_id: string
    user_metadata: Record<string, any>
}

export interface UserCreate extends UserBase {}

export interface UserUpdate {
    external_id?: string
    user_metadata?: Record<string, any>
}

export interface UserResponse extends UserBase {
    id: string
    created_at: string
    updated_at: string
}

export interface UserListResponse {
    users: UserResponse[]
    total: number
}
