import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  getKeyValue,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Progress,
  useDisclosure,
  Accordion,
  AccordionItem
} from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { getWorkflows, getWorkflowRuns, createWorkflow, uploadDataset, startBatchRun, deleteWorkflow, getTemplates, instantiateTemplate, duplicateWorkflow } from '../utils/api';
import { useRouter } from 'next/router';
import TemplateCard from './cards/TemplateCard';
import WorkflowBatchRunsTable from './WorkflowBatchRunsTable';
import { Template } from '../types/workflow';
import { WorkflowResponse, WorkflowCreateRequest, WorkflowDefinition } from '@/types/api_types/workflowSchemas';
import { RunResponse } from '../types/api_types/runSchemas';

const Dashboard: React.FC = () => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<Record<string, RunResponse[]>>({});

  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    const fetchWorkflowsAndRuns = async () => {
      try {
        const workflows = await getWorkflows();
        setWorkflows(workflows);

        // Fetch runs for each workflow
        const runsMap: Record<string, RunResponse[]> = {};
        for (const workflow of workflows) {
          const runs = await getWorkflowRuns(workflow.id);
          runsMap[workflow.id] = runs.slice(0, 5); // Get only the 5 most recent runs
        }
        setWorkflowRuns(runsMap);
      } catch (error) {
        console.error('Error fetching workflows and runs:', error);
      }
    };

    fetchWorkflowsAndRuns();
  }, []);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const templates = await getTemplates();
        setTemplates(templates);
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    };

    fetchTemplates();
  }, []);

  const columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "recent_runs", label: "Recent Runs" },
    { key: "action", label: "Action" },
  ];

  const handleRunClick = (workflow: WorkflowResponse) => {
    setSelectedWorkflow(workflow);
    onOpen();
  };

  const handleEditClick = (workflow: WorkflowResponse) => {
    router.push({
      pathname: `/workflows/${workflow.id}`,
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleRunWorkflow = async () => {
    if (!file || !selectedWorkflow) {
      alert('Please upload a file');
      return;
    }

    try {
      const datasetName = `Dataset_${Date.now()}`;
      const datasetDescription = `Uploaded dataset for workflow ${selectedWorkflow.name}`;
      const uploadedDataset = await uploadDataset(datasetName, datasetDescription, file);

      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 500);

      await startBatchRun(selectedWorkflow.id, uploadedDataset.id);
    } catch (error) {
      console.error('Error running workflow:', error);
    }
  };

  const handleNewWorkflowClick = async () => {
    try {
      const uniqueName = `New Spur ${new Date().toLocaleString()}`;
      const newWorkflow: WorkflowCreateRequest = {
        name: uniqueName,
        description: '',
        definition: {
          nodes: [],
          links: [],
          test_inputs: []
        }
      };

      const createdWorkflow = await createWorkflow(newWorkflow);
      router.push(`/workflows/${createdWorkflow.id}`);
    } catch (error) {
      console.error('Error creating new workflow:', error);
    }
  };

  const handleImportWorkflowClick = async () => {
    try {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';

      fileInput.onchange = async (event: Event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) {
          alert('No file selected. Please try again.');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e: ProgressEvent<FileReader>) => {
          try {
            const result = e.target?.result;
            if (typeof result !== 'string') return;

            const jsonContent = JSON.parse(result);
            const uniqueName = `Imported Spur ${new Date().toLocaleString()}`;

            const newWorkflow: WorkflowCreateRequest = {
              name: uniqueName,
              description: jsonContent.description || '',
              definition: {
                nodes: jsonContent.definition?.nodes || [],
                links: jsonContent.definition?.links || [],
                test_inputs: jsonContent.definition?.test_inputs || []
              }
            };
            const createdWorkflow = await createWorkflow(newWorkflow);
            router.push(`/workflows/${createdWorkflow.id}`);
          } catch (error) {
            console.error('Error processing the JSON file:', error);
            alert('Failed to import workflow. Please ensure the file is a valid JSON.');
          }
        };
        reader.readAsText(file);
      };
      fileInput.click();
    } catch (error) {
      console.error('Error importing workflow:', error);
    }
  };

  const handleUseTemplate = async (template: Template) => {
    try {
      const newWorkflow = await instantiateTemplate(template);
      router.push(`/workflows/${newWorkflow.id}`);
    } catch (error) {
      console.error('Error using template:', error);
    }
  };

  const handleDeleteClick = async (workflow: WorkflowResponse) => {
    if (window.confirm(`Are you sure you want to delete workflow "${workflow.name}"?`)) {
      try {
        await deleteWorkflow(workflow.id);
        setWorkflows((prevWorkflows) => prevWorkflows.filter((w) => w.id !== workflow.id));
        console.log(`Workflow "${workflow.name}" deleted successfully.`);
      } catch (error) {
        console.error('Error deleting workflow:', error);
        alert('Failed to delete workflow. Please try again.');
      }
    }
  };

  const handleDuplicateClick = async (workflow: WorkflowResponse) => {
    try {
      const duplicatedWorkflow = await duplicateWorkflow(workflow.id);
      setWorkflows((prevWorkflows) => [...prevWorkflows, duplicatedWorkflow]);
      console.log(`Workflow "${workflow.name}" duplicated successfully.`);
    } catch (error) {
      console.error('Error duplicating workflow:', error);
      alert('Failed to duplicate workflow. Please try again.');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="w-3/4 mx-auto p-5">
        {/* Dashboard Header */}
        <header className="mb-6 flex w-full items-center">
          <div className="flex flex-col max-w-fit" id="dashboard-title">
            <h1 className="text-xl font-bold text-default-900 lg:text-3xl">Dashboard</h1>
            <p className="text-small text-default-400 lg:text-medium">Manage your spurs</p>
          </div>
          <div className="ml-auto flex items-center gap-2" id="new-workflow-entries">
            <Button
              className="bg-foreground text-background"
              startContent={
                <Icon className="flex-none text-background/60" icon="lucide:plus" width={16} />
              }
              onClick={handleNewWorkflowClick}
            >
              New Spur
            </Button>
            <Button
              className="bg-foreground text-background"
              startContent={
                <Icon className="flex-none text-background/60" icon="lucide:upload" width={16} />
              }
              onClick={handleImportWorkflowClick}
            >
              Import Spur
            </Button>
          </div>
        </header>

        {/* Wrap sections in Accordion */}
        <Accordion defaultExpandedKeys={["1", "2", "3"]} selectionMode="multiple">
          <AccordionItem
            key="1"
            aria-label="Spur Templates"
            title={
              <h3 className="text-xl font-semibold mb-4">
                Spur Templates
              </h3>
            }
          >
            {/* Spur Templates Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 px-1 mb-8">
              {templates.map((template) => (
                <TemplateCard
                  key={template.file_name}
                  title={template.name}
                  description={template.description}
                  features={template.features}
                  onUse={() => handleUseTemplate(template)}
                />
              ))}
            </div>
          </AccordionItem>

          <AccordionItem
            key="2"
            aria-label="Recent Spurs"
            title={
              <h3 className="text-xl font-semibold mb-4">
                Recent Spurs
              </h3>
            }
          >
            {/* Recent Spurs Section */}
            {workflows.length > 0 ? (
              <Table aria-label="Saved Workflows" isHeaderSticky>
                <TableHeader columns={columns}>
                  {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
                </TableHeader>
                <TableBody items={workflows}>
                  {(workflow) => (
                    <TableRow key={workflow.id}>
                      {(columnKey) => (
                        <TableCell>
                          {columnKey === "recent_runs" ? (
                            <div className="flex gap-2 items-center">
                              {workflowRuns[workflow.id]?.map((run) => (
                                <Button
                                  key={run.id}
                                  size="sm"
                                  variant="flat"
                                  onClick={() => window.open(`/trace/${run.id}`, '_blank')}
                                  className="min-w-0"
                                >
                                  {run.id.slice(0, 8)}
                                </Button>
                              ))}
                            </div>
                          ) : columnKey === "action" ? (
                            <div className="flex items-center gap-2">
                              <Icon
                                icon="solar:play-bold"
                                className="cursor-pointer text-default-400"
                                height={18}
                                width={18}
                                onClick={() => handleRunClick(workflow)}
                              />
                              <Icon
                                icon="solar:pen-bold"
                                className="cursor-pointer text-default-400"
                                height={18}
                                width={18}
                                onClick={() => handleEditClick(workflow)}
                              />
                              <Icon
                                icon="solar:copy-bold"
                                className="cursor-pointer text-default-400"
                                height={18}
                                width={18}
                                onClick={() => handleDuplicateClick(workflow)}
                              />
                              <Icon
                                icon="solar:trash-bin-trash-bold"
                                className="cursor-pointer text-default-400"
                                height={18}
                                width={18}
                                onClick={() => handleDeleteClick(workflow)}
                              />
                            </div>
                          ) : (
                            getKeyValue(workflow, columnKey)
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <p>No spur runs available.</p>
            )}
          </AccordionItem>

          <AccordionItem
            key="3"
            aria-label="Spur Jobs"
            title={
              <h3 className="text-xl font-semibold mb-4">
                Spur Jobs
              </h3>
            }
          >
            {/* Spur Jobs Section */}
            <WorkflowBatchRunsTable />
          </AccordionItem>
        </Accordion>
      </div>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Run {selectedWorkflow?.name}
              </ModalHeader>
              <ModalBody>
                <Input
                  type="file"
                  accept=".csv,.jsonl"
                  onChange={handleFileChange}
                  label="Upload CSV or JSONL"
                />
                {progress > 0 && <Progress value={progress} />}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Close
                </Button>
                <Button
                  color="primary"
                  onPress={handleRunWorkflow}
                  disabled={progress > 0 && progress < 100}
                >
                  {progress > 0 && progress < 100 ? 'Running...' : 'Run'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Dashboard;
