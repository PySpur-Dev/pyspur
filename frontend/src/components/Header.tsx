import {
    Alert,
    Button,
    CircularProgress,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Link,
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarItem,
    Spinner,
    Tooltip,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { formatDistanceStrict } from 'date-fns'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useDispatch, useSelector } from 'react-redux'
import { useSaveWorkflow } from '../hooks/useSaveWorkflow'
import { useWorkflowExecution } from '../hooks/useWorkflowExecution'
import { setProjectName } from '../store/flowSlice'
import { AlertState } from '../types/alert'
import { getRunStatus, getWorkflow } from '../utils/api'
import { handleDownloadImage } from './canvas/FlowCanvas'
import DeployModal from './modals/DeployModal'
import HelpModal from './modals/HelpModal'
import RunModal from './modals/RunModal'
import SettingsCard from './modals/SettingsModal'

interface HeaderProps {
    activePage: 'dashboard' | 'workflow' | 'evals' | 'trace' | 'rag' | 'library'
    associatedWorkflowId?: string
    runId?: string
}

import { RootState } from '../store/store'

const Header: React.FC<HeaderProps> = ({ activePage, associatedWorkflowId, runId }) => {
    const dispatch = useDispatch()
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const projectName = useSelector((state: RootState) => state.flow.projectName)
    const [isDebugModalOpen, setIsDebugModalOpen] = useState<boolean>(false)
    const [isDeployModalOpen, setIsDeployModalOpen] = useState<boolean>(false)
    const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false)
    const workflowId = useSelector((state: RootState) => state.flow.workflowID)
    const [alert, setAlert] = useState<AlertState>({
        message: '',
        color: 'default',
        isVisible: false,
    })
    const testInputs = useSelector((state: RootState) => state.flow.testInputs)
    const [selectedRow, setSelectedRow] = useState<string | null>(null)
    const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false)

    const router = useRouter()
    const { id } = router.query
    const isRun = id && id[0] == 'R'

    const showAlert = (message: string, color: AlertState['color']) => {
        setAlert({ message, color, isVisible: true })
        setTimeout(() => setAlert((prev) => ({ ...prev, isVisible: false })), 3000)
    }

    const {
        isRunning,
        completionPercentage,
        workflowRuns,
        isUpdatingStatus,
        executeWorkflow,
        stopWorkflow,
        updateRunStatuses,
    } = useWorkflowExecution({ onAlert: showAlert })

    const saveWorkflow = useSaveWorkflow()

    useEffect(() => {
        if (testInputs.length > 0 && !selectedRow) {
            setSelectedRow(testInputs[0].id.toString())
        }
    }, [testInputs])

    const handleRunWorkflow = async (): Promise<void> => {
        setIsDebugModalOpen(true)
    }

    const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        dispatch(setProjectName(e.target.value))
        saveWorkflow()
    }

    const handleDownloadWorkflow = async (): Promise<void> => {
        if (!workflowId) return

        try {
            const workflow = await getWorkflow(workflowId)

            const workflowDetails = {
                name: workflow.name,
                definition: workflow.definition,
                description: workflow.description,
            }

            const blob = new Blob([JSON.stringify(workflowDetails, null, 2)], {
                type: 'application/json',
            })

            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${projectName.replace(/\s+/g, '_')}.json`

            document.body.appendChild(a)
            a.click()

            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Error downloading workflow:', error)
        }
    }

    const handleDeploy = (): void => {
        setIsDeployModalOpen(true)
    }

    useEffect(() => {
        if (isHistoryOpen) {
            updateRunStatuses()
        }
    }, [isHistoryOpen])

    useHotkeys(
        ['mod+enter'],
        (e) => {
            e.preventDefault()

            if (testInputs.length === 0) {
                setIsDebugModalOpen(true)
                return
            }

            const testCase = testInputs.find((row) => row.id.toString() === selectedRow) ?? testInputs[0]

            if (testCase) {
                const { id, ...inputValues } = testCase
                const inputNode = nodes.find((node) => node.type === 'InputNode')
                const inputNodeId = inputNode?.data?.title || inputNode?.id

                if (inputNodeId) {
                    const initialInputs = {
                        [inputNodeId]: inputValues,
                    }
                    executeWorkflow(initialInputs)
                }
            }
        },
        {
            enableOnFormTags: true,
            enabled: activePage === 'workflow',
        }
    )

    const handleDownloadTrace = async (): Promise<void> => {
        if (!runId) return

        try {
            // Show loading state in the alert
            showAlert('Preparing trace data...', 'default')

            // Fetch run data on demand
            const runData = await getRunStatus(runId)

            const traceData = {
                id: runData.id,
                workflow_id: runData.workflow_id,
                status: runData.status,
                start_time: runData.start_time,
                end_time: runData.end_time,
                initial_inputs: runData.initial_inputs,
                outputs: runData.outputs,
                tasks: runData.tasks.map((task) => ({
                    id: task.id,
                    node_id: task.node_id,
                    status: task.status,
                    inputs: task.inputs,
                    outputs: task.outputs,
                    error: task.error,
                    start_time: task.start_time,
                    end_time: task.end_time,
                })),
            }

            const blob = new Blob([JSON.stringify(traceData, null, 2)], {
                type: 'application/json',
            })

            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `trace_${runData.id}.json`

            document.body.appendChild(a)
            a.click()

            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            // Show success message
            showAlert('Trace downloaded successfully', 'success')
        } catch (error) {
            console.error('Error downloading trace:', error)
            showAlert('Error downloading trace', 'danger')
        }
    }

    return (
        <>
            {alert.isVisible && (
                <div className="fixed bottom-4 right-4 z-50">
                    <Alert color={alert.color}>{alert.message}</Alert>
                </div>
            )}
            <Navbar
                classNames={{
                    base: 'lg:bg-background lg:backdrop-filter-none h-12 shadow-sm',
                    wrapper: 'max-w-7xl w-full mx-auto',
                    item: [
                        'flex',
                        'relative',
                        'h-full',
                        'items-center',
                        "data-[active=true]:after:content-['']",
                        'data-[active=true]:after:absolute',
                        'data-[active=true]:after:bottom-0',
                        'data-[active=true]:after:left-0',
                        'data-[active=true]:after:right-0',
                        'data-[active=true]:after:h-[2px]',
                        'data-[active=true]:after:rounded-[2px]',
                        'data-[active=true]:after:bg-primary',
                        'data-[active=true]:after:text-primary',
                    ],
                }}
            >
                <NavbarBrand className="h-full max-w-fit">
                    {activePage === 'dashboard' ? (
                        <div className="flex items-center gap-2 cursor-pointer">
                            <p className="font-bold text-lg text-default-900">PySpur</p>
                        </div>
                    ) : (
                        <Link href="/" className="cursor-pointer">
                            <div className="flex items-center gap-2">
                                <p className="font-bold text-default-900">PySpur</p>
                            </div>
                        </Link>
                    )}
                </NavbarBrand>

                {(activePage === 'workflow' || activePage === 'trace') && (
                    <NavbarContent
                        className="h-12 rounded-full bg-transparent sm:flex"
                        id="workflow-title"
                        justify="start"
                    >
                        <Input
                            className="px-4"
                            type="text"
                            placeholder="Project Name"
                            value={projectName}
                            onChange={handleProjectNameChange}
                            disabled={activePage !== 'workflow'}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur()
                                }
                            }}
                        />
                    </NavbarContent>
                )}
                <NavbarContent
                    className="h-12 gap-4 rounded-full bg-content2 px-4 dark:bg-content1 max-w-fit"
                    justify="end"
                    id="dashboard-editor-nav"
                >
                    <NavbarItem isActive={activePage === 'dashboard'}>
                        <Link className="flex gap-2 text-inherit" href="/dashboard">
                            Dashboard
                        </Link>
                    </NavbarItem>
                    {activePage === 'workflow' && <NavbarItem isActive={activePage === 'workflow'}>Editor</NavbarItem>}
                    {activePage === 'trace' && <NavbarItem isActive={activePage === 'trace'}>Trace</NavbarItem>}
                    <NavbarItem isActive={activePage === 'library'}>
                        <Link className="flex gap-2 text-inherit" href="/library">
                            Library
                        </Link>
                    </NavbarItem>
                    <NavbarItem isActive={activePage === 'evals'}>
                        <Link className="flex gap-2 text-inherit" href="/evals">
                            Evals
                        </Link>
                    </NavbarItem>
                    <NavbarItem isActive={activePage === 'rag'}>
                        <Link className="flex gap-2 text-inherit" href="/rag">
                            RAG
                        </Link>
                    </NavbarItem>
                </NavbarContent>
                {activePage === 'workflow' && (
                    <NavbarContent
                        className="ml-auto flex h-12 max-w-fit items-center gap-0 rounded-full p-0 lg:bg-content2 lg:px-1 lg:dark:bg-content1"
                        justify="end"
                        id="workflow-actions-buttons"
                    >
                        {!isRun && (
                            <>
                                {isRunning ? (
                                    <>
                                        <NavbarItem className="hidden sm:flex">
                                            <CircularProgress
                                                size="sm"
                                                value={completionPercentage}
                                                color="success"
                                                showValueLabel={true}
                                                aria-label="Running progress"
                                            />
                                        </NavbarItem>
                                        <NavbarItem className="hidden sm:flex">
                                            <Button isIconOnly radius="full" variant="light" onPress={stopWorkflow}>
                                                <Icon
                                                    className="text-foreground/60"
                                                    icon="solar:stop-linear"
                                                    width={22}
                                                />
                                            </Button>
                                        </NavbarItem>
                                    </>
                                ) : (
                                    <NavbarItem className="hidden sm:flex">
                                        <Tooltip
                                            content={
                                                <div className="px-1 py-2">
                                                    <div className="text-small font-bold">Run Workflow</div>
                                                    <div className="text-tiny">
                                                        Press{' '}
                                                        <kbd>
                                                            {navigator.platform.includes('Mac') ? '⌘ CMD' : 'Ctrl'}
                                                        </kbd>
                                                        +<kbd>Enter</kbd>
                                                    </div>
                                                </div>
                                            }
                                            placement="bottom"
                                        >
                                            <Button
                                                isIconOnly
                                                radius="full"
                                                variant="light"
                                                onPress={handleRunWorkflow}
                                            >
                                                <Icon
                                                    className="text-foreground/60"
                                                    icon="solar:play-linear"
                                                    width={22}
                                                />
                                            </Button>
                                        </Tooltip>
                                    </NavbarItem>
                                )}
                            </>
                        )}
                        <NavbarItem className="hidden sm:flex">
                            <Dropdown isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                                <DropdownTrigger>
                                    <Button isIconOnly radius="full" variant="light">
                                        <Icon className="text-foreground/60" icon="solar:history-linear" width={22} />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu>
                                    {isUpdatingStatus ? (
                                        <DropdownItem key={`fetching-latest-runs`}>
                                            <div className="flex items-center gap-2">
                                                <Spinner size="sm" />
                                                <span>Fetching latest runs...</span>
                                            </div>
                                        </DropdownItem>
                                    ) : (
                                        workflowRuns.map((run, index) => (
                                            <DropdownItem
                                                key={index}
                                                onPress={() => window.open(`/trace/${run.id}`, '_blank')}
                                                textValue={`Version ${index + 1}`}
                                            >
                                                {`${run.id} | ${run.status.toLowerCase()} ${
                                                    (run.status.toLowerCase() === 'running' ||
                                                        run.status.toLowerCase() === 'pending') &&
                                                    run.start_time
                                                        ? `for last ${formatDistanceStrict(Date.parse(run.start_time + 'Z'), new Date(), { addSuffix: false })}`
                                                        : (run.status.toLowerCase() === 'failed' ||
                                                                run.status.toLowerCase() === 'completed') &&
                                                            run.end_time
                                                          ? `${formatDistanceStrict(Date.parse(run.end_time + 'Z'), new Date(), { addSuffix: true })}`
                                                          : ''
                                                }`}
                                            </DropdownItem>
                                        ))
                                    )}
                                </DropdownMenu>
                            </Dropdown>
                        </NavbarItem>
                        <NavbarItem className="hidden sm:flex">
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button isIconOnly radius="full" variant="light">
                                        <Icon className="text-foreground/60" icon="solar:download-linear" width={24} />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu>
                                    <DropdownItem
                                        key="download-json-workflow"
                                        onPress={handleDownloadWorkflow}
                                        startContent={
                                            <Icon
                                                className="text-foreground/60"
                                                icon="solar:document-text-linear"
                                                width={20}
                                            />
                                        }
                                    >
                                        Download JSON
                                    </DropdownItem>
                                    <DropdownItem
                                        key="download-image-workflow"
                                        onPress={handleDownloadImage}
                                        startContent={
                                            <Icon
                                                className="text-foreground/60"
                                                icon="solar:gallery-linear"
                                                width={20}
                                            />
                                        }
                                    >
                                        Download Image
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        </NavbarItem>
                        <NavbarItem className="hidden sm:flex">
                            <Button isIconOnly radius="full" variant="light" onPress={handleDeploy}>
                                <Icon className="text-foreground/60" icon="solar:cloud-upload-linear" width={24} />
                            </Button>
                        </NavbarItem>
                    </NavbarContent>
                )}
                {activePage === 'trace' && associatedWorkflowId && (
                    <NavbarContent
                        className="ml-auto flex h-12 max-w-fit items-center gap-0 rounded-full p-0 lg:bg-content2 lg:px-1 lg:dark:bg-content1"
                        justify="end"
                    >
                        <NavbarItem className="hidden sm:flex">
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button isIconOnly radius="full" variant="light">
                                        <Icon className="text-foreground/60" icon="solar:download-linear" width={24} />
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu>
                                    <DropdownItem
                                        key="download-json-trace"
                                        onPress={handleDownloadTrace}
                                        startContent={
                                            <Icon
                                                className="text-foreground/60"
                                                icon="solar:document-text-linear"
                                                width={20}
                                            />
                                        }
                                    >
                                        Download JSON
                                    </DropdownItem>
                                    <DropdownItem
                                        key="download-image-trace"
                                        onPress={handleDownloadImage}
                                        startContent={
                                            <Icon
                                                className="text-foreground/60"
                                                icon="solar:gallery-linear"
                                                width={20}
                                            />
                                        }
                                    >
                                        Download Image
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        </NavbarItem>
                        <NavbarItem>
                            <Link href={`/workflows/${associatedWorkflowId}`}>
                                <Button variant="light">Go To Workflow</Button>
                            </Link>
                        </NavbarItem>
                    </NavbarContent>
                )}
                <NavbarContent
                    className="flex h-12 max-w-fit items-center gap-0 rounded-full p-0 lg:bg-content2 lg:px-1 lg:dark:bg-content1"
                    justify="end"
                >
                    <NavbarItem className="hidden sm:flex">
                        <SettingsCard />
                    </NavbarItem>
                    <NavbarItem className="hidden sm:flex">
                        <Button
                            isIconOnly
                            radius="full"
                            variant="light"
                            onPress={() => setIsHelpModalOpen(true)}
                            aria-label="Help"
                        >
                            <Icon className="text-foreground/60" icon="solar:question-circle-linear" width={24} />
                        </Button>
                    </NavbarItem>
                </NavbarContent>
            </Navbar>
            <RunModal
                isOpen={isDebugModalOpen}
                onOpenChange={setIsDebugModalOpen}
                onRun={async (selectedInputs) => {
                    await executeWorkflow(selectedInputs)
                    setIsDebugModalOpen(false)
                }}
                selectedRow={selectedRow}
                onSelectedRowChange={setSelectedRow}
            />
            <DeployModal
                isOpen={isDeployModalOpen}
                onOpenChange={setIsDeployModalOpen}
                workflowId={workflowId}
                testInput={testInputs.find((row) => row.id.toString() === selectedRow) ?? testInputs[0]}
            />
            <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
        </>
    )
}

export default Header
