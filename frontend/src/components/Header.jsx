import React, { useState } from 'react';
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
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import SettingsCard from './settings/Settings';
import { setProjectName, updateNodeData, resetRun } from '../store/flowSlice'; // Ensure updateNodeData is imported
import RunModal from './RunModal';
import { getRunStatus, startRun, getWorkflow, createSpur } from '../utils/api';
import { Toaster, toast } from 'sonner'

const Header = ({ activePage }) => {
  const dispatch = useDispatch();
  const nodes = useSelector((state) => state.flow.nodes);
  const projectName = useSelector((state) => state.flow.projectName);
  const [isRunning, setIsRunning] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  let currentStatusInterval = null;

  const updateWorkflowStatus = async (runID) => {
    let pollCount = 0;
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    currentStatusInterval = setInterval(async () => {
      try {
        const statusResponse = await getRunStatus(runID);
        const outputs = statusResponse.outputs;

        if (statusResponse.status === 'FAILED') {
          setIsRunning(false);
          clearInterval(currentStatusInterval);
          toast.error('Workflow run failed.');
          return;
        }

        // Update nodes based on outputs
        if (outputs) {
          Object.entries(outputs).forEach(([nodeId, output_values]) => {
            const node = nodes.find((node) => node.id === nodeId);
            if (output_values) {
              dispatch(updateNodeData({ id: nodeId, data: { run: { ...node.data.run, ...output_values } } }));
            }
          });
        }

        if (statusResponse.status !== 'RUNNING') {
          setIsRunning(false);
          clearInterval(currentStatusInterval);
          toast.success('Workflow run completed.');
        }

        pollCount += 1;
      } catch (error) {
        console.error('Error fetching workflow status:', error);
        clearInterval(currentStatusInterval);
      }
    }, 1000);
  };

  // get the workflow ID from the URL
  const workflowID = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : null;

  const executeWorkflow = async (inputValues) => {
    try {
      toast('Starting workflow run...');
      const result = await startRun(workflowID, inputValues, null, 'interactive');
      setIsRunning(true);
      dispatch(resetRun());
      updateWorkflowStatus(result.id);
    } catch (error) {
      console.error('Error starting workflow run:', error);
      toast.error('Error starting workflow run.');
    }
  };

  const handleRunWorkflow = async () => {
    setIsDebugModalOpen(true);
  };

  const handleStopWorkflow = () => {
    setIsRunning(false);
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    toast('Workflow run stopped.');
  };

  const handleProjectNameChange = (e) => {
    dispatch(setProjectName(e.target.value));
  };

  const handleDownloadWorkflow = async () => {
    try {
      // Get the current workflow using the workflowID from Redux state
      const workflow = await getWorkflow(workflowID);

      const workflowDetails = {
        name: workflow.name,
        definition: workflow.definition,
        description: workflow.description
      };

      // Create a JSON blob from the workflow data
      const blob = new Blob([JSON.stringify(workflowDetails, null, 2)], {
        type: 'application/json'
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}.json`; // Use project name for the file

      // Trigger download
      document.body.appendChild(a);
      a.click();

      // Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading workflow:', error);
      // You might want to add some user feedback here
    }
  };

  const handleDeploy = async () => {
    try {
      setIsDeploying(true);
      const workflow = await getWorkflow(workflowID);
      console.log('Workflow data:', workflow);

      // Extract input and output schemas from workflow definition
      const definition = workflow.definition;
      const inputNode = definition.nodes.find(node => node.id === 'input_node');
      const outputNodes = definition.nodes.filter(node => node.node_type === 'OutputNode');

      const inputSchema = inputNode?.config?.schema || {};
      const outputSchema = outputNodes.reduce((schema, node) => {
        if (node.config?.schema) {
          schema[node.id] = node.config.schema;
        }
        return schema;
      }, {});

      const spurName = `${projectName}-api`;

      // For now, we'll create a spur without a specific version
      // The backend will use the latest version by default
      const result = await createSpur(
        workflowID,
        null, // Let the backend use the latest version
        spurName,
        workflow.description,
        inputSchema,
        outputSchema
      );
      toast.success('API deployed successfully! API Key: ' + result.api_key);
    } catch (error) {
      console.error('Error deploying API:', error);
      toast.error('Failed to deploy API: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <>
      <Toaster richColors position="bottom-right" />
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
          justify="start"
          className="h-12 max-w-fit"
        >
          {activePage === "home" ? (
            <p className="font-bold text-inherit cursor-pointer">PySpur</p>
          ) : (
            <Link href="/" className="cursor-pointer">
              <p className="font-bold text-inherit">PySpur</p>
            </Link>
          )}
        </NavbarBrand>

        {activePage === "workflow" && (
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
            />
          </NavbarContent>
        )}
        <NavbarContent
          className="h-12 gap-4 rounded-full bg-content2 px-4 dark:bg-content1 max-w-fit"
          justify="end"
          id="home-editor-nav"
        >
          <NavbarItem isActive={activePage === "home"}>
            <Link className="flex gap-2 text-inherit" href="/">
              Home
            </Link>
          </NavbarItem>
          {activePage === "workflow" && (
            <NavbarItem isActive={activePage === "workflow"}>
              Editor
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
            {isRunning ? (
              <>
                <NavbarItem className="hidden sm:flex">
                  <Spinner size="sm" />
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
                isLoading={isDeploying}
              >
                <Icon
                  className="text-default-500"
                  icon="solar:cloud-upload-linear"
                  width={24}
                />
              </Button>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <SettingsCard />
            </NavbarItem>
          </NavbarContent>
        )}
      </Navbar>
      <RunModal
        isOpen={isDebugModalOpen}
        onOpenChange={setIsDebugModalOpen}
        onRun={async (selectedInputs) => {
          await executeWorkflow(selectedInputs);
          setIsDebugModalOpen(false);
        }}
      />
    </>
  );
};

export default Header;