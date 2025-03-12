import Chat from '@/components/chat/Chat'
import { SessionResponse } from '@/types/api_types/sessionSchemas'
import { getSession } from '@/utils/api'
import { Button, Spinner } from '@heroui/react'
import { Icon } from '@iconify/react'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

const SessionChatPage: React.FC = () => {
    const router = useRouter()
    const { userId, sessionId } = router.query
    const [session, setSession] = useState<SessionResponse | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchSession = async () => {
            if (!sessionId || typeof sessionId !== 'string') return

            try {
                setIsLoading(true)
                setError(null)
                const sessionData = await getSession(sessionId)
                setSession(sessionData)
            } catch (error) {
                console.error('Error fetching session:', error)
                setError('Failed to fetch session. Please try again.')
            } finally {
                setIsLoading(false)
            }
        }

        if (sessionId) {
            fetchSession()
        }
    }, [sessionId])

    if (!sessionId || !userId) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Spinner size="lg" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2 max-w-7xl w-full mx-auto pt-2 px-6 h-[calc(100vh-2rem)]">
            <header className="mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <h1 className="text-lg font-bold text-default-900 lg:text-2xl">Session Chat</h1>
                        <p className="text-small text-default-400 lg:text-medium">Session ID: {sessionId}</p>
                    </div>
                    <Button
                        className="bg-foreground text-background"
                        startContent={<Icon icon="lucide:arrow-left" width={16} />}
                        onPress={() => router.push(`/sessions/${userId}`)}
                    >
                        Back to Sessions
                    </Button>
                </div>
            </header>

            {error ? (
                <div className="flex justify-center items-center h-full">
                    <p className="text-danger">{error}</p>
                </div>
            ) : isLoading ? (
                <div className="flex justify-center items-center h-full">
                    <Spinner size="lg" />
                </div>
            ) : (
                <div className="flex-grow h-full">
                    <Chat
                        workflowID={session?.workflow_id}
                        sessionId={typeof sessionId === 'string' ? sessionId : undefined}
                    />
                </div>
            )}
        </div>
    )
}

export default SessionChatPage
