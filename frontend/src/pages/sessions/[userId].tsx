import { SessionResponse } from '@/types/api_types/sessionSchemas'
import { WorkflowResponse } from '@/types/api_types/workflowSchemas'
import { getWorkflow, listSessions } from '@/utils/api'
import {
    Alert,
    Button,
    Chip,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

const SessionsPage: React.FC = () => {
    const router = useRouter()
    const { userId } = router.query
    const [sessions, setSessions] = useState<SessionResponse[]>([])
    const [workflows, setWorkflows] = useState<Record<string, WorkflowResponse>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const renderCell = (session: SessionResponse, columnKey: string): React.ReactNode => {
        switch (columnKey) {
            case 'workflow':
                return session.workflow_id && workflows[session.workflow_id] ? (
                    <Chip
                        size="sm"
                        variant="flat"
                        className="cursor-pointer"
                        onClick={() => router.push(`/workflows/${session.workflow_id}`)}
                    >
                        {workflows[session.workflow_id].name}
                    </Chip>
                ) : (
                    'N/A'
                )
            case 'messages':
                return (
                    <Chip
                        size="sm"
                        variant="flat"
                        className="cursor-pointer"
                        onClick={() => handleViewSession(session.id)}
                    >
                        {session.messages.length.toString()} messages
                    </Chip>
                )
            case 'action':
                return (
                    <div className="flex items-center gap-2">
                        <Icon
                            icon="lucide:eye"
                            className="cursor-pointer text-default-400"
                            height={18}
                            width={18}
                            onClick={() => handleViewSession(session.id)}
                            aria-label="View Session"
                        />
                    </div>
                )
            case 'created_at':
            case 'updated_at':
                return formatDate(session[columnKey])
            default:
                return session[columnKey as keyof SessionResponse]?.toString() || ''
        }
    }

    const columns = [
        { key: 'id', label: 'Session ID' },
        { key: 'workflow', label: 'Workflow' },
        { key: 'messages', label: 'Messages' },
        { key: 'created_at', label: 'Created' },
        { key: 'updated_at', label: 'Last Updated' },
        { key: 'action', label: 'Actions' },
    ]

    useEffect(() => {
        if (userId && typeof userId === 'string') {
            fetchSessions()
        }
    }, [userId])

    const fetchSessions = async () => {
        if (!userId || typeof userId !== 'string') return

        try {
            setIsLoading(true)
            setError(null)
            const sessionsData = await listSessions(0, 10, userId)
            setSessions(sessionsData.sessions)
            setHasMore(sessionsData.total > sessionsData.sessions.length)

            // Fetch associated workflows
            const workflowsMap: Record<string, WorkflowResponse> = {}
            await Promise.all(
                sessionsData.sessions.map(async (session) => {
                    if (session.workflow_id) {
                        const workflow = await getWorkflow(session.workflow_id)
                        workflowsMap[session.workflow_id] = workflow
                    }
                })
            )
            setWorkflows(workflowsMap)
        } catch (error) {
            console.error('Error fetching sessions:', error)
            setError('Failed to fetch sessions. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleLoadMore = async () => {
        if (!userId || typeof userId !== 'string') return

        try {
            setIsLoadingMore(true)
            setError(null)
            const nextPage = page + 1
            const sessionsData = await listSessions((nextPage - 1) * 10, 10, userId)

            // Fetch workflows for new sessions
            const workflowsMap: Record<string, WorkflowResponse> = { ...workflows }
            await Promise.all(
                sessionsData.sessions.map(async (session) => {
                    if (session.workflow_id && !workflowsMap[session.workflow_id]) {
                        const workflow = await getWorkflow(session.workflow_id)
                        workflowsMap[session.workflow_id] = workflow
                    }
                })
            )

            setSessions((prev) => [...prev, ...sessionsData.sessions])
            setWorkflows(workflowsMap)
            setPage(nextPage)
            setHasMore(sessionsData.total > sessionsData.sessions.length + sessions.length)
        } catch (error) {
            console.error('Error loading more sessions:', error)
            setError('Failed to load more sessions. Please try again.')
        } finally {
            setIsLoadingMore(false)
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const handleViewSession = (sessionId: string) => {
        if (userId && typeof userId === 'string') {
            router.push(`/sessions/${userId}/${sessionId}`)
        }
    }

    if (!userId) {
        return (
            <div className="flex flex-col gap-2 max-w-7xl w-full mx-auto pt-2 px-6">
                <div className="flex justify-center p-4">
                    <Spinner size="lg" />
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2 max-w-7xl w-full mx-auto pt-2 px-6">
            <header className="mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <h1 className="text-lg font-bold text-default-900 lg:text-2xl">User Sessions</h1>
                        <p className="text-small text-default-400 lg:text-medium">
                            Viewing sessions for user: {userId}
                        </p>
                    </div>
                    <Button
                        className="bg-foreground text-background"
                        startContent={<Icon icon="lucide:arrow-left" width={16} />}
                        onPress={() => router.push('/dashboard')}
                    >
                        Back to Dashboard
                    </Button>
                </div>
            </header>

            {error && (
                <Alert className="mb-4" color="danger" variant="flat">
                    {error}
                </Alert>
            )}

            {isLoading ? (
                <div className="flex justify-center p-4">
                    <Spinner size="lg" />
                </div>
            ) : sessions.length > 0 ? (
                <div className="flex flex-col gap-2">
                    <Table aria-label="Sessions" isHeaderSticky>
                        <TableHeader columns={columns}>
                            {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
                        </TableHeader>
                        <TableBody items={sessions}>
                            {(session) => (
                                <TableRow key={session.id}>
                                    {(columnKey) => <TableCell>{renderCell(session, columnKey.toString())}</TableCell>}
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {hasMore && (
                        <div className="flex justify-center mt-4">
                            <Button
                                variant="flat"
                                onPress={handleLoadMore}
                                isLoading={isLoadingMore}
                                startContent={!isLoadingMore && <Icon icon="lucide:plus" width={16} />}
                            >
                                {isLoadingMore ? 'Loading...' : 'Load More'}
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <p className="text-muted-foreground">No sessions found for this user.</p>
                </div>
            )}
        </div>
    )
}

export default SessionsPage
