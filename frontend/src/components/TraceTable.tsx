import { RunResponse, RunStatus } from '@/types/api_types/runSchemas'
import { getWorkflowRuns } from '@/utils/api'
import type { DateValue } from '@heroui/react'
import {
    Button,
    Chip,
    DatePicker,
    Input,
    Select,
    SelectItem,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import NodeOutputDisplay from './nodes/NodeOutputDisplay'

interface TraceTableProps {
    workflowId: string
}

const getStatusColor = (status: RunStatus): 'success' | 'warning' | 'danger' | 'default' => {
    switch (status) {
        case 'COMPLETED':
            return 'success'
        case 'RUNNING':
        case 'PENDING':
        case 'PAUSED':
            return 'warning'
        case 'FAILED':
        case 'CANCELLED':
            return 'danger'
        default:
            return 'default'
    }
}

const getStatusIcon = (status: RunStatus): string => {
    switch (status) {
        case 'COMPLETED':
            return 'solar:check-circle-linear'
        case 'RUNNING':
            return 'solar:running-linear'
        case 'PENDING':
            return 'solar:clock-circle-linear'
        case 'PAUSED':
            return 'solar:pause-circle-linear'
        case 'FAILED':
            return 'solar:danger-circle-linear'
        case 'CANCELLED':
            return 'solar:close-circle-linear'
        default:
            return 'solar:question-circle-linear'
    }
}

// Separate component for the table content
const RunsTable: React.FC<{
    runs: RunResponse[]
    isLoading: boolean
    handleRunClick: (runId: string) => void
}> = React.memo(({ runs, isLoading, handleRunClick }) => {
    const columns = [
        { key: 'run_id', label: 'Run ID' },
        { key: 'time', label: 'Time (UTC)' },
        { key: 'inputs', label: 'Inputs' },
        { key: 'duration', label: 'Duration' },
        { key: 'status', label: 'Status' },
    ]

    const formatDuration = (startTime?: string, endTime?: string) => {
        if (!startTime) return '-'

        // Ensure timestamps are treated as UTC
        const utcStartTime = startTime.endsWith('Z') ? startTime : startTime + 'Z'
        const start = parseISO(utcStartTime)

        // For end time, use the provided time or current time
        const utcEndTime = endTime ? (endTime.endsWith('Z') ? endTime : endTime + 'Z') : undefined
        const end = utcEndTime ? parseISO(utcEndTime) : new Date()

        // Calculate duration in seconds
        const durationInSeconds = (end.getTime() - start.getTime()) / 1000

        // Format the duration in a more readable way
        if (durationInSeconds < 60) {
            return `${Math.round(durationInSeconds)}s`
        } else if (durationInSeconds < 3600) {
            return `${Math.floor(durationInSeconds / 60)}m ${Math.round(durationInSeconds % 60)}s`
        } else {
            const hours = Math.floor(durationInSeconds / 3600)
            const minutes = Math.floor((durationInSeconds % 3600) / 60)
            return `${hours}h ${minutes}m`
        }
    }

    const formatTimestamp = (timestamp: string) => {
        // Ensure the timestamp is treated as UTC by appending 'Z' if it's not already there
        const utcTimestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z'
        const date = parseISO(utcTimestamp)
        return (
            <div className="flex flex-col">
                <span>{format(date, "MMM d, yyyy HH:mm:ss 'UTC'")}</span>
                <span className="text-xs text-default-400">{formatDistanceToNow(date, { addSuffix: true })}</span>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex justify-center p-4">
                <Spinner size="lg" />
            </div>
        )
    }

    if (runs.length === 0) {
        return <div className="flex justify-center p-8 text-default-500">No runs found for this spur</div>
    }

    return (
        <Table aria-label="Spur Runs" isHeaderSticky>
            <TableHeader columns={columns}>
                {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
            </TableHeader>
            <TableBody items={runs}>
                {(run) => (
                    <TableRow key={run.id}>
                        {(columnKey) => (
                            <TableCell>
                                {columnKey === 'time' ? (
                                    run.start_time ? (
                                        formatTimestamp(run.start_time)
                                    ) : (
                                        '-'
                                    )
                                ) : columnKey === 'inputs' ? (
                                    <div>
                                        {run.initial_inputs ? (
                                            <div className="border rounded-lg overflow-hidden">
                                                <NodeOutputDisplay
                                                    output={Object.values(run.initial_inputs)[0] || {}}
                                                    maxHeight="100px"
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-default-400">No inputs</span>
                                        )}
                                    </div>
                                ) : columnKey === 'run_id' ? (
                                    <Chip
                                        size="sm"
                                        variant="flat"
                                        className="cursor-pointer"
                                        onClick={() => handleRunClick(run.id)}
                                    >
                                        {run.id}
                                    </Chip>
                                ) : columnKey === 'duration' ? (
                                    <span>{formatDuration(run.start_time, run.end_time)}</span>
                                ) : columnKey === 'status' ? (
                                    <Chip
                                        size="sm"
                                        variant="flat"
                                        color={getStatusColor(run.status)}
                                        startContent={<Icon icon={getStatusIcon(run.status)} width={16} />}
                                    >
                                        {run.status}
                                    </Chip>
                                ) : null}
                            </TableCell>
                        )}
                    </TableRow>
                )}
            </TableBody>
        </Table>
    )
})

RunsTable.displayName = 'RunsTable'

const TraceTable: React.FC<TraceTableProps> = ({ workflowId }) => {
    const router = useRouter()
    const [runs, setRuns] = useState<RunResponse[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [startDate, setStartDate] = useState<DateValue>(null)
    const [endDate, setEndDate] = useState<DateValue>(null)
    const [startTime, setStartTime] = useState<string>('00:00')
    const [endTime, setEndTime] = useState<string>('23:59')
    const [numRuns, setNumRuns] = useState<string>('100')
    const [page, setPage] = useState(1)
    const [hasMoreRuns, setHasMoreRuns] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [selectedStatus, setSelectedStatus] = useState<RunStatus | ''>('')

    const statusOptions: { label: string; value: RunStatus | '' }[] = [
        { label: 'All', value: '' },
        { label: 'Completed', value: 'COMPLETED' },
        { label: 'Running', value: 'RUNNING' },
        { label: 'Pending', value: 'PENDING' },
        { label: 'Failed', value: 'FAILED' },
        { label: 'Cancelled', value: 'CANCELLED' },
        { label: 'Paused', value: 'PAUSED' },
    ]

    const createUTCDate = (date: Date, time: string): Date => {
        const [hours, minutes] = time.split(':').map(Number)
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes))
    }

    const fetchRuns = async (isLoadMore: boolean = false) => {
        try {
            const currentPage = isLoadMore ? page + 1 : 1
            setIsLoading(!isLoadMore)
            if (isLoadMore) {
                setIsLoadingMore(true)
            }

            let start: Date | undefined
            let end: Date | undefined

            if (startDate) {
                start = createUTCDate(new Date(startDate.toString()), startTime)
            }

            if (endDate) {
                end = createUTCDate(new Date(endDate.toString()), endTime)
            }

            const workflowRuns = await getWorkflowRuns(
                workflowId,
                currentPage,
                parseInt(numRuns),
                start,
                end,
                selectedStatus || undefined
            )

            // Sort runs by start time in descending order (newest first)
            const sortedRuns = workflowRuns.sort((a, b) => {
                const dateA = a.start_time
                    ? new Date(a.start_time.endsWith('Z') ? a.start_time : a.start_time + 'Z').getTime()
                    : 0
                const dateB = b.start_time
                    ? new Date(b.start_time.endsWith('Z') ? b.start_time : b.start_time + 'Z').getTime()
                    : 0
                return dateB - dateA
            })

            if (isLoadMore) {
                setRuns((prevRuns) => [...prevRuns, ...sortedRuns])
            } else {
                setRuns(sortedRuns)
            }

            setPage(currentPage)
            setHasMoreRuns(workflowRuns.length === parseInt(numRuns))
        } catch (error) {
            console.error('Error fetching workflow runs:', error)
        } finally {
            setIsLoading(false)
            setIsLoadingMore(false)
        }
    }

    useEffect(() => {
        fetchRuns()
        // Set up polling for active runs
        const intervalId = setInterval(() => {
            const hasActiveRuns = runs.some(
                (run) => run.status === 'RUNNING' || run.status === 'PENDING' || run.status === 'PAUSED'
            )
            if (hasActiveRuns) {
                fetchRuns()
            }
        }, 5000) // Poll every 5 seconds if there are active runs

        return () => clearInterval(intervalId)
    }, [workflowId, startDate, endDate, startTime, endTime, numRuns, selectedStatus])

    const handleApplyFilter = () => {
        setPage(1)
        fetchRuns()
    }

    const handleClearFilter = () => {
        setStartDate(null)
        setEndDate(null)
        setStartTime('00:00')
        setEndTime('23:59')
        setNumRuns('100')
        setSelectedStatus('')
        setPage(1)
    }

    const handleLoadMore = () => {
        fetchRuns(true)
    }

    const handleRunClick = (runId: string) => {
        window.open(`/trace/${runId}`, '_blank')
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-default-600">Start Date (UTC)</label>
                    <DatePicker
                        value={startDate}
                        onChange={setStartDate}
                        labelPlacement="outside"
                        classNames={{
                            base: 'min-w-[200px]',
                            input: 'min-w-[200px]',
                        }}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-default-600">Start Time (UTC)</label>
                    <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="min-w-[150px]"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-default-600">End Date (UTC)</label>
                    <DatePicker
                        value={endDate}
                        onChange={setEndDate}
                        labelPlacement="outside"
                        classNames={{
                            base: 'min-w-[200px]',
                            input: 'min-w-[200px]',
                        }}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-default-600">End Time (UTC)</label>
                    <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="min-w-[150px]"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-default-600">Number of Runs</label>
                    <Select value={numRuns} onChange={(e) => setNumRuns(e.target.value)} className="min-w-[120px]">
                        <SelectItem key="10" value="10">
                            10 runs
                        </SelectItem>
                        <SelectItem key="20" value="20">
                            20 runs
                        </SelectItem>
                        <SelectItem key="100" value="100">
                            100 runs
                        </SelectItem>
                        <SelectItem key="200" value="200">
                            200 runs
                        </SelectItem>
                    </Select>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-default-600">Status</label>
                    <Select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value as RunStatus | '')}
                        className="min-w-[150px]"
                    >
                        {statusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </Select>
                </div>
                <div className="flex gap-2">
                    <Button color="primary" onClick={handleApplyFilter}>
                        Apply Filter
                    </Button>
                    <Button variant="flat" onClick={handleClearFilter}>
                        Clear
                    </Button>
                </div>
            </div>

            <RunsTable runs={runs} isLoading={isLoading} handleRunClick={handleRunClick} />

            {hasMoreRuns && (
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
    )
}

export default TraceTable
