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
import { useWorkflowFileOperations } from '../hooks/useWorkflowFileOperations'
import { setProjectName, setRunModalOpen } from '../store/flowSlice'
import { RootState } from '../store/store'
import { AlertState } from '../types/alert'
import { getRunStatus, getWorkflow } from '../utils/api'
import ConfirmationModal from './modals/ConfirmationModal'
import DeployModal from './modals/DeployModal'
import HelpModal from './modals/HelpModal'
import RunModal from './modals/RunModal'
import SettingsModal from './modals/SettingsModal'

interface HeaderProps {
    activePage: 'dashboard' | 'workflow' | 'evals' | 'trace' | 'rag'
    associatedWorkflowId?: string
    runId?: string
    handleDownloadImage?: () => void
}

const Header: React.FC<HeaderProps> = ({ activePage, associatedWorkflowId, runId, handleDownloadImage }) => {
    const dispatch = useDispatch()
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const projectName = useSelector((state: RootState) => state.flow.projectName)
    const nodeTypesConfig = useSelector((state: RootState) => state.nodeTypes.data)
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
    const selectedTestInputId = useSelector((state: RootState) => state.flow.selectedTestInputId)
    const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false)
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false)
    const isRunModalOpen = useSelector((state: RootState) => state.flow.isRunModalOpen)

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

    const { handleFileUpload, isConfirmationOpen, setIsConfirmationOpen, handleConfirmOverwrite, pendingWorkflowData } =
        useWorkflowFileOperations({ showAlert })

    const handleRunWorkflow = async (): Promise<void> => {
        dispatch(setRunModalOpen(true))
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

    useEffect(() => {
        if (activePage === 'workflow' || activePage === 'trace') {
            document.title = `${projectName} - PySpur`
        }
        if (activePage === 'dashboard') {
            document.title = `Dashboard - PySpur`
        }
        if (activePage === 'evals') {
            document.title = `Evals - PySpur`
        }
        if (activePage === 'rag') {
            document.title = `RAG - PySpur`
        }
    }, [projectName, activePage])

    useHotkeys(
        ['mod+enter'],
        (e) => {
            e.preventDefault()

            if (testInputs.length === 0) {
                setIsDebugModalOpen(true)
                return
            }

            const testCase = testInputs.find((row) => row.id.toString() === selectedTestInputId) ?? testInputs[0]

            if (testCase) {
                const { id, ...inputValues } = testCase
                const inputNode = nodes.find((node) => node.type === 'InputNode')
                const inputNodeId = inputNode?.id

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
            <ConfirmationModal
                isOpen={isConfirmationOpen}
                onClose={() => setIsConfirmationOpen(false)}
                onConfirm={handleConfirmOverwrite}
                title="Overwrite Workflow"
                message={`Are you sure you want to overwrite the current workflow with "${pendingWorkflowData?.name}"? This action cannot be undone.`}
                confirmText="Overwrite"
                isDanger
            />
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
                            <Tooltip content="Upload Workflow JSON">
                                <Button isIconOnly radius="full" variant="light" onPress={handleFileUpload}>
                                    <Icon className="text-foreground/60" icon="solar:upload-linear" width={24} />
                                </Button>
                            </Tooltip>
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
                        <Button isIconOnly radius="full" variant="light" onPress={() => setIsSettingsModalOpen(true)}>
                            <Icon className="text-foreground/60" icon="solar:settings-linear" width={24} />
                        </Button>
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
                isOpen={isRunModalOpen}
                onOpenChange={(isOpen) => dispatch(setRunModalOpen(isOpen))}
                onRun={async (selectedInputs) => {
                    await executeWorkflow(selectedInputs)
                    dispatch(setRunModalOpen(false))
                }}
            />
            <DeployModal
                isOpen={isDeployModalOpen}
                onOpenChange={setIsDeployModalOpen}
                workflowId={workflowId}
                testInput={testInputs.find((row) => row.id.toString() === selectedTestInputId) ?? testInputs[0]}
            />
            <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
            <SettingsModal isOpen={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen} />
        </>
    )
}

export default Header