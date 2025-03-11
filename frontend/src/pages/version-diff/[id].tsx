import Header from '@/components/Header'
import { WorkflowVersionResponse } from '@/types/api_types/workflowSchemas'
import { getWorkflowVersions } from '@/utils/api'
import { Button, Card, CardBody, Select, SelectItem, Spinner } from '@heroui/react'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'

const WorkflowVersionDiff: React.FC = () => {
    const router = useRouter()
    const { id } = router.query
    const [versions, setVersions] = useState<WorkflowVersionResponse[]>([])
    const [selectedVersions, setSelectedVersions] = useState<{
        left: number | null
        right: number | null
    }>({ left: null, right: null })
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchVersions = async () => {
            if (!id) return
            try {
                const workflowVersions = await getWorkflowVersions(id as string)
                setVersions(workflowVersions)

                // Check for URL query parameters
                const leftVersion = router.query.left ? parseInt(router.query.left as string) : null
                const rightVersion = router.query.right ? parseInt(router.query.right as string) : null

                if (leftVersion && rightVersion) {
                    setSelectedVersions({
                        left: leftVersion,
                        right: rightVersion,
                    })
                } else if (workflowVersions.length >= 2) {
                    // Default to comparing latest with previous version
                    setSelectedVersions({
                        left: workflowVersions[1].version,
                        right: workflowVersions[0].version,
                    })
                }
            } catch (error) {
                console.error('Error fetching workflow versions:', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchVersions()
    }, [id, router.query])

    const getVersionById = (version: number) => {
        return versions.find((v) => v.version === version)
    }

    const leftVersion = selectedVersions.left !== null ? getVersionById(selectedVersions.left) : null
    const rightVersion = selectedVersions.right !== null ? getVersionById(selectedVersions.right) : null

    return (
        <div className="flex flex-col h-screen">
            <Header activePage="trace" associatedWorkflowId={id as string} />
            <div className="flex-1 p-6 overflow-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold">Compare Workflow Versions</h1>
                        <Button variant="light" onPress={() => router.push(`/workflows/${id}`)}>
                            Back to Workflow
                        </Button>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center items-center h-64">
                            <Spinner size="lg" />
                        </div>
                    ) : (
                        <>
                            <Card>
                                <CardBody>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <Select
                                                label="Base Version"
                                                placeholder="Select a version"
                                                selectedKeys={
                                                    selectedVersions.left ? [selectedVersions.left.toString()] : []
                                                }
                                                onChange={(value) =>
                                                    setSelectedVersions((prev) => ({
                                                        ...prev,
                                                        left: parseInt(value.target.value),
                                                    }))
                                                }
                                            >
                                                {versions.map((version, index) => (
                                                    <SelectItem
                                                        key={version.version.toString()}
                                                        value={version.version.toString()}
                                                    >
                                                        {`${index === 0 ? 'Current Version' : `Version ${version.version}`} (${formatDistanceToNow(
                                                            new Date(version.created_at),
                                                            {
                                                                addSuffix: true,
                                                            }
                                                        )})`}
                                                    </SelectItem>
                                                ))}
                                            </Select>
                                        </div>
                                        <div className="flex-1">
                                            <Select
                                                label="Compare Version"
                                                placeholder="Select a version"
                                                selectedKeys={
                                                    selectedVersions.right ? [selectedVersions.right.toString()] : []
                                                }
                                                onChange={(value) =>
                                                    setSelectedVersions((prev) => ({
                                                        ...prev,
                                                        right: parseInt(value.target.value),
                                                    }))
                                                }
                                            >
                                                {versions.map((version, index) => (
                                                    <SelectItem
                                                        key={version.version.toString()}
                                                        value={version.version.toString()}
                                                    >
                                                        {`${index === 0 ? 'Current Version' : `Version ${version.version}`} (${formatDistanceToNow(
                                                            new Date(version.created_at),
                                                            {
                                                                addSuffix: true,
                                                            }
                                                        )})`}
                                                    </SelectItem>
                                                ))}
                                            </Select>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>

                            {leftVersion && rightVersion && (
                                <Card>
                                    <CardBody>
                                        <ReactDiffViewer
                                            oldValue={JSON.stringify(leftVersion.definition, null, 2)}
                                            newValue={JSON.stringify(rightVersion.definition, null, 2)}
                                            splitView={true}
                                            useDarkTheme={false}
                                        />
                                    </CardBody>
                                </Card>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default WorkflowVersionDiff
