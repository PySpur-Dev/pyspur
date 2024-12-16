import React, { useState, useEffect } from 'react';
import { getKeyValue, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Button, Progress } from '@nextui-org/react';
import { Key } from '@react-types/shared';
import { Icon } from '@iconify/react';
import { getAllRuns, downloadOutputFile } from '../utils/api';

interface Workflow {
  name: string;
}

interface WorkflowRun {
  id: string;
  workflow: Workflow;
  input_dataset_id: string | null;
  status: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
  output_file_id: string;
}

interface FormattedRun {
  key: string;
  id: string;
  workflow_name: string;
  dataset: string;
  progress: number;
  output_file_id: string;
}

interface Column {
  key: string;
  label: string;
}

const WorkflowBatchRunsTable: React.FC = () => {
  const [workflowBatchRuns, setWorkflowBatchRuns] = useState<FormattedRun[]>([]);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const runs = await getAllRuns();
        const formattedRuns = runs.map((run: WorkflowRun) => ({
          key: run.id,
          id: run.id,
          workflow_name: run.workflow.name,
          dataset: run.input_dataset_id || 'N/A',
          progress: run.status === 'COMPLETED' ? 100 : run.status === 'FAILED' ? 0 : 50,
          output_file_id: run.output_file_id,
        }));
        setWorkflowBatchRuns(formattedRuns);
      } catch (error) {
        console.error('Error fetching runs:', error);
      }
    };

    fetchRuns();
    const intervalId = setInterval(fetchRuns, 10000); // Poll every 10 seconds

    return () => clearInterval(intervalId); // Cleanup interval on component unmount
  }, []);

  const activeColumns: Column[] = [
    { key: "id", label: "RUN ID" },
    { key: "workflow_name", label: "WORKFLOW" },
    { key: "dataset", label: "DATASET" },
    { key: "progress", label: "STATUS" },
    { key: "download", label: "DOWNLOAD" },
  ];

  const handleDownload = (batchRun: FormattedRun) => {
    downloadOutputFile(batchRun.output_file_id);
  };

  return (
    <>
      {workflowBatchRuns.length > 0 ? (
        <Table aria-label="Spur Jobs" isHeaderSticky>
          <TableHeader columns={activeColumns}>
            {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
          </TableHeader>
          <TableBody items={workflowBatchRuns}>
            {(batchRun: FormattedRun) => (
              <TableRow key={batchRun.key}>
                {(columnKey: Key) => (
                  <TableCell>
                    {columnKey === "progress" ? (
                      batchRun.progress === 100 ? (
                        <span className="text-success">Finished</span>
                      ) : (
                        <Progress value={batchRun.progress} />
                      )
                    ) : columnKey === "download" ? (
                      batchRun.progress === 100 ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onClick={() => handleDownload(batchRun)}
                        >
                          <Icon
                            icon="solar:download-linear"
                            className="text-default-400"
                            width={20}
                          />
                        </Button>
                      ) : null
                    ) : (
                      getKeyValue(batchRun, columnKey)
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
    </>
  );
};

export default WorkflowBatchRunsTable;
