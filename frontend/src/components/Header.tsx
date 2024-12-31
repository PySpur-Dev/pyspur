import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Input,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Link,
  Button,
  Spinner,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Alert,
  CircularProgress,
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import SettingsCard from './modals/SettingsModal';
import { setProjectName, updateNodeDataOnly, resetRun } from '../store/flowSlice';
import RunModal from './modals/RunModal';
import { getRunStatus, startRun, getWorkflow } from '../utils/api';
import { Toaster, toast } from 'sonner'
import { getWorkflowRuns } from '../utils/api';
import { useRouter } from 'next/router';
import DeployModal from './modals/DeployModal';
import { formatDistanceStrict } from 'date-fns';
import { useHotkeys } from 'react-hotkeys-hook';

interface HeaderProps {
  activePage: 'dashboard' | 'workflow' | 'evals' | 'trace';
}

interface Node {
  id: string;
  data: {
    run?: Record<string, any>;
  };
}

import { RootState } from '../store/store';
interface AlertState {
  message: string;
  color: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  isVisible: boolean;
}

const Header: React.FC<HeaderProps> = ({ activePage }) => {
  const dispatch = useDispatch();
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const projectName = useSelector((state: RootState) => state.flow.projectName);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState<boolean>(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState<boolean>(false);
  const [workflowRuns, setWorkflowRuns] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const workflowId = useSelector((state: RootState) => state.flow.workflowID);
  const [alert, setAlert] = useState<AlertState>({ message: '', color: 'default', isVisible: false });
  const testInputs = useSelector((state: RootState) => state.flow.testInputs);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [completionPercentage, setCompletionPercentage] = useState<number>(0);

  const router = useRouter();
  const { id } = router.query;
  const isRun = id && id[0] == 'R';

  let currentStatusInterval: NodeJS.Timeout | null = null;

  const fetchWorkflowRuns = async () => {
    try {
      const response = await getWorkflowRuns(workflowId);
      setWorkflowRuns(response);
    }
    catch (error) {
      console.error('Error fetching workflow runs:', error);
    }
  };

  useEffect(() => {
    if (workflowId) {
      fetchWorkflowRuns();
    }
  }, [workflowId]);

  useEffect(() => {
    if (testInputs.length > 0 && !selectedRow) {
      setSelectedRow(testInputs[0].id);
    }
  }, [testInputs]);

  const showAlert = (message: string, color: AlertState['color']) => {
    setAlert({ message, color, isVisible: true });
    setTimeout(() => setAlert(prev => ({ ...prev, isVisible: false })), 3000);
  };

  const updateWorkflowStatus = async (runID: string): Promise<void> => {
    let pollCount = 0;
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    currentStatusInterval = setInterval(async () => {
      try {
        const statusResponse = await getRunStatus(runID);
        const tasks = statusResponse.tasks;

        if (statusResponse.percentage_complete !== undefined) {
          setCompletionPercentage(statusResponse.percentage_complete);
        }

        if (statusResponse.status === 'FAILED' || tasks.some(task => task.status === 'FAILED')) {
          setIsRunning(false);
          setCompletionPercentage(0);
          clearInterval(currentStatusInterval);
          showAlert('Workflow run failed.', 'danger');
          return;
        }

        if (tasks.length > 0) {
          tasks.forEach((task) => {
            const nodeId = task.node_id;
            let node = nodes.find(node => node.id === nodeId);
            if (!node) {
              node = nodes.find(node => node.data?.config?.title === task.node_id);
            }
            if (!node) {
              return;
            }
            const output_values = task.outputs || {};
            const nodeTaskStatus = task.status;
            if (node) {
              // Check if the task output or status is different from current node data
              const isOutputDifferent = JSON.stringify(output_values) !== JSON.stringify(node.data?.run);
              const isStatusDifferent = nodeTaskStatus !== node.data?.taskStatus;

              if (isOutputDifferent || isStatusDifferent) {
                dispatch(updateNodeDataOnly({
                  id: node.id,
                  data: {
                    run: { ...node.data.run, ...output_values },
                    taskStatus: nodeTaskStatus
                  }
                }));
              }
            }
          });
        }

        if (statusResponse.status !== 'RUNNING') {
          setIsRunning(false);
          setCompletionPercentage(0);
          clearInterval(currentStatusInterval);
          showAlert('Workflow run completed.', 'success');
        }

        pollCount += 1;
      } catch (error) {
        console.error('Error fetching workflow status:', error);
        clearInterval(currentStatusInterval);
      }
    }, 1000);
  };

  const workflowID = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : null;

  const executeWorkflow = async (inputValues: Record<string, any>): Promise<void> => {
    if (!workflowID) return;

    try {
      showAlert('Starting workflow run...', 'default');
      const result = await startRun(workflowId, inputValues, null, 'interactive');
      setIsRunning(true);
      fetchWorkflowRuns();
      dispatch(resetRun());
      updateWorkflowStatus(result.id);
    } catch (error) {
      console.error('Error starting workflow run:', error);
      showAlert('Error starting workflow run.', 'danger');
    }
  };

  const handleRunWorkflow = async (): Promise<void> => {
    setIsDebugModalOpen(true);
  };

  const handleStopWorkflow = (): void => {
    setIsRunning(false);
    setCompletionPercentage(0);
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    showAlert('Workflow run stopped.', 'warning');
  };

  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    dispatch(setProjectName(e.target.value));
  };

  const handleDownloadWorkflow = async (): Promise<void> => {
    if (!workflowID) return;

    try {
      const workflow = await getWorkflow(workflowID);

      const workflowDetails = {
        name: workflow.name,
        definition: workflow.definition,
        description: workflow.description
      };

      const blob = new Blob([JSON.stringify(workflowDetails, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}.json`;

      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading workflow:', error);
    }
  };

  const handleDeploy = (): void => {
    setIsDeployModalOpen(true);
  };

  const getApiEndpoint = (): string => {
    if (typeof window === 'undefined') {
      return '';
    }
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/wf/${workflowId}/start_run/?run_type=non_blocking`;
  };

  const workflowInputVariables = useSelector((state: RootState) => state.flow.workflowInputVariables);

  useHotkeys(
    ['mod+enter', 'ctrl+enter'],
    (e) => {
      e.preventDefault();

      if (testInputs.length === 0) {
        setIsDebugModalOpen(true);
        return;
      }

      const testCase = testInputs.find(row => row.id === selectedRow)
        ?? testInputs[0];

      if (testCase) {
        const { id, ...inputValues } = testCase;
        const inputNodeId = nodes.find(node => node.type === 'InputNode')?.id;

        if (inputNodeId) {
          const initialInputs = {
            [inputNodeId]: inputValues
          };
          executeWorkflow(initialInputs);
        }
      }
    },
    {
      enableOnFormTags: true,
      enabled: activePage === 'workflow'
    }
  );

  const updateRunStatuses = async () => {
    if (!workflowId || !isHistoryOpen) return;

    setIsUpdatingStatus(true);
    try {
      // First fetch the latest workflow runs
      const latestRuns = await getWorkflowRuns(workflowId);
      setWorkflowRuns(latestRuns);

      // Then update the status of running/pending runs
      const updatedRuns = await Promise.all(
        latestRuns.map(async (run) => {
          if (run.status.toLowerCase() === 'running' || run.status.toLowerCase() === 'pending') {
            const statusResponse = await getRunStatus(run.id);
            return { ...run, status: statusResponse.status };
          }
          return run;
        })
      );

      setWorkflowRuns(updatedRuns);
    } catch (error) {
      console.error('Error updating run statuses:', error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  useEffect(() => {
    if (isHistoryOpen) {
      updateRunStatuses();
    }
  }, [isHistoryOpen]);

  return (
    <>
      {alert.isVisible && (
        <div className="fixed bottom-4 right-4 z-50">
          <Alert color={alert.color}>
            {alert.message}
          </Alert>
        </div>
      )}
      <Navbar
        classNames={{
          base: "lg:bg-background lg:backdrop-filter-none h-12 mt-1 shadow-sm",
          wrapper: "px-4 sm:px-6",
          item: [
            "flex",
            "relative",
            "h-full",
            "items-center",
            "data-[active=true]:after:content-['']",
            "data-[active=true]:after:absolute",
            "data-[active=true]:after:bottom-0",
            "data-[active=true]:after:left-0",
            "data-[active=true]:after:right-0",
            "data-[active=true]:after:h-[2px]",
            "data-[active=true]:after:rounded-[2px]",
            "data-[active=true]:after:bg-primary",
            "data-[active=true]:after:text-primary",
          ],
        }}
      >
        <NavbarBrand
          className="h-12 max-w-fit"
        >
          {activePage === "dashboard" ? (
            <p className="font-bold text-inherit cursor-pointer">PySpur</p>
          ) : (
            <Link href="/" className="cursor-pointer">
              <p className="font-bold text-inherit">PySpur</p>
            </Link>
          )}
        </NavbarBrand>

        {(activePage === "workflow" || activePage === "trace") && (
          <NavbarContent
            className="h-12 rounded-full bg-content2 dark:bg-content1 sm:flex"
            id="workflow-title"
            justify="start"
          >
            <Input
              className="px-4"
              type="text"
              placeholder="Project Name"
              value={projectName}
              onChange={handleProjectNameChange}
              disabled={activePage !== "workflow"}
            />
          </NavbarContent>
        )}
        <NavbarContent
          className="h-12 gap-4 rounded-full bg-content2 px-4 dark:bg-content1 max-w-fit"
          justify="end"
          id="dashboard-editor-nav"
        >
          <NavbarItem isActive={activePage === "dashboard"}>
            <Link className="flex gap-2 text-inherit" href="/dashboard">
              Dashboard
            </Link>
          </NavbarItem>
          {activePage === "workflow" && (
            <NavbarItem isActive={activePage === "workflow"}>
              Editor
            </NavbarItem>
          )}
          {activePage === "trace" && (
            <NavbarItem isActive={activePage === "trace"}>
              Trace
            </NavbarItem>
          )}
          <NavbarItem isActive={activePage === "evals"}>
            <Link className="flex gap-2 text-inherit" href="/evals">
              Evals
            </Link>
          </NavbarItem>
        </NavbarContent>
        {activePage === "workflow" && (
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
                      <Button isIconOnly radius="full" variant="light" onClick={handleStopWorkflow}>
                        <Icon className="text-default-500" icon="solar:stop-linear" width={22} />
                      </Button>
                    </NavbarItem>
                  </>
                ) : (
                  <NavbarItem className="hidden sm:flex">
                    <Button isIconOnly radius="full" variant="light" onClick={handleRunWorkflow}>
                      <Icon className="text-default-500" icon="solar:play-linear" width={22} />
                    </Button>
                  </NavbarItem>
                )}
              </>
            )}
            <NavbarItem className="hidden sm:flex">
              <Dropdown isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DropdownTrigger>
                  <Button isIconOnly radius="full" variant="light">
                    <Icon className="text-default-500" icon="solar:history-linear" width={22} />
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
                        {`${run.id} | ${run.status.toLowerCase()} ${(run.status.toLowerCase() === 'running' || run.status.toLowerCase() === 'pending') && run.start_time
                          ? `for last ${formatDistanceStrict(Date.parse(run.start_time + 'Z'), new Date(), { addSuffix: false })}`
                          : (run.status.toLowerCase() === 'failed' || run.status.toLowerCase() === 'completed') && run.end_time
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
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onClick={handleDownloadWorkflow}
              >
                <Icon
                  className="text-default-500"
                  icon="solar:download-linear"
                  width={24}
                />
              </Button>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onClick={handleDeploy}
              >
                <Icon
                  className="text-default-500"
                  icon="solar:cloud-upload-linear"
                  width={24}
                />
              </Button>
            </NavbarItem>
          </NavbarContent>
        )}
        <NavbarContent
          className="ml-2 flex h-12 max-w-fit items-center gap-0 rounded-full p-0 lg:bg-content2 lg:px-1 lg:dark:bg-content1"
          justify="end"
        >
          <NavbarItem className="hidden sm:flex">
            <SettingsCard />
          </NavbarItem>
        </NavbarContent>
      </Navbar>
      <RunModal
        isOpen={isDebugModalOpen}
        onOpenChange={setIsDebugModalOpen}
        onRun={async (selectedInputs) => {
          await executeWorkflow(selectedInputs);
          setIsDebugModalOpen(false);
        }}
      />
      <DeployModal
        isOpen={isDeployModalOpen}
        onOpenChange={setIsDeployModalOpen}
        getApiEndpoint={getApiEndpoint}
      />
    </>
  );
};

export default Header;