import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import Header from "../components/Header";
import { getEvals, startEvalRun, listEvalRuns, getEvalRunStatus } from "../utils/api";
import EvalCard from "../components/cards/EvalCard";
import { Spinner, Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Alert } from "@nextui-org/react";
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { EvalItem, EvalRun, EvalRunResponse, EvalRunData, EvalCardRunProps } from '../types/eval';

const statusColorMap: Record<string, "warning" | "primary" | "success" | "danger"> = {
  PENDING: "primary",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
};

interface AlertState {
  message: string;
  color: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  isVisible: boolean;
}

const EvalsPage: React.FC = () => {
  const [evals, setEvals] = useState<EvalItem[]>([]);
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { theme } = useTheme();
  const [alert, setAlert] = useState<AlertState>({ message: '', color: 'default', isVisible: false });

  const router = useRouter();

  // Helper function to safely parse results
  const parseResults = (results: string | null): Record<string, any> | null => {
    if (!results) return null;
    if (typeof results === "string") {
      try {
        return JSON.parse(results);
      } catch (error) {
        console.error("Error parsing results:", error);
        return null;
      }
    }
    return results;
  };

  const showAlert = (message: string, color: AlertState['color']) => {
    setAlert({ message, color, isVisible: true });
    setTimeout(() => setAlert(prev => ({ ...prev, isVisible: false })), 3000);
  };

  useEffect(() => {
    const fetchEvals = async () => {
      try {
        const evalsData = await getEvals();
        setEvals(evalsData);
      } catch (error) {
        console.error("Error fetching evals:", error);
        showAlert("Failed to load evals.", "danger");
      } finally {
        setLoading(false);
      }
    };

    fetchEvals();
  }, []);

  useEffect(() => {
    const fetchEvalRuns = async () => {
      try {
        const runsData = await listEvalRuns();

        const runsDataWithResults = await Promise.all(
          runsData.map(async (run: EvalRun) => {
            if (run.status === "COMPLETED") {
              try {
                const evalRunData = await getEvalRunStatus(run.run_id);
                const parsedResults = parseResults(JSON.stringify(evalRunData.results));
                return {
                  ...run,
                  results: parsedResults,
                };
              } catch (error) {
                console.error(`Error fetching results for run ${run.run_id}:`, error);
                return run;
              }
            }
            return run;
          })
        );

        setEvalRuns(runsDataWithResults);
      } catch (error) {
        console.error("Error fetching eval runs:", error);
        showAlert("Failed to load eval runs.", "danger");
      }
    };
    fetchEvalRuns();
    const interval = setInterval(fetchEvalRuns, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLaunchEval = async (
    workflowId: string,
    evalName: string,
    numSamples: number,
    outputVariable: string
  ): Promise<void> => {
    if (!workflowId) {
      showAlert("Workflow ID is missing.", "danger");
      return;
    }
    if (!outputVariable) {
      showAlert("Output variable is missing.", "danger");
      return;
    }

    try {
      showAlert(`Launching eval with output variable: ${outputVariable} and ${numSamples} samples...`, "default");
      const evalRunResponse = await startEvalRun(workflowId, evalName, outputVariable, numSamples);
      showAlert(`Eval run started.`, "success");
      setEvalRuns((prevRuns: EvalRun[]) => [...prevRuns, evalRunResponse as EvalRun]);
    } catch (error) {
      console.error("Error launching eval:", error);
      showAlert(`Failed to launch eval.`, "danger");
    }
  };

  const handleViewResults = async (evalRunId: string): Promise<void> => {
    router.push(`/evals/${evalRunId}`);
  };

  return (
    <div className="App relative">
      <Header activePage="evals" />
      <div className="p-6">
        <h1 className="text-2xl font-bold mt-8 mb-4">Eval Jobs</h1>
        {evalRuns.length > 0 ? (
          <Table aria-label="Eval Jobs Table" isHeaderSticky>
            <TableHeader>
              <TableColumn>Run ID</TableColumn>
              <TableColumn>Eval Name</TableColumn>
              <TableColumn>Workflow ID</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Accuracy</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody items={evalRuns}>
              {(run: EvalRun) => (
                <TableRow key={run.run_id}>
                  <TableCell>{run.run_id}</TableCell>
                  <TableCell>{run.eval_name}</TableCell>
                  <TableCell>{run.workflow_id}</TableCell>
                  <TableCell>
                    <Chip
                      className="capitalize"
                      color={statusColorMap[run.status]}
                      size="sm"
                      variant="flat"
                    >
                      {run.status === "RUNNING" ? (
                        <div className="flex items-center gap-2">
                          <Spinner size="sm" />
                          {run.status}
                        </div>
                      ) : (
                        run.status
                      )}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {run.results && run.results.accuracy !== undefined ? (
                      <div style={{ width: 50, height: 50 }}>
                        <RadialBarChart
                          width={50}
                          height={50}
                          cx={25}
                          cy={25}
                          innerRadius={18}
                          outerRadius={25}
                          barSize={7}
                          data={[{ name: 'Accuracy', value: run.results.accuracy * 100 }]}
                          startAngle={90}
                          endAngle={-270}
                        >
                          <RadialBar
                            dataKey="value"
                            cornerRadius={12}
                            fill={theme === 'dark' ? "hsl(143 55% 62%)" : "hsl(143 55% 42%)"}
                            background={{
                              fill: theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'
                            }}
                          />
                          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                          <text
                            x={25}
                            y={25}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{
                              fontSize: "11px",
                              fontWeight: "600",
                              fill: theme === 'dark' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)'
                            }}
                          >
                            {`${(run.results.accuracy * 100).toFixed(1)}%`}
                          </text>
                        </RadialBarChart>
                      </div>
                    ) : run.status === "COMPLETED" ? (
                      "N/A"
                    ) : (
                      "--"
                    )}
                  </TableCell>
                  <TableCell>
                    {run.status === "COMPLETED" ? (
                      <Button size="sm" onPress={() => handleViewResults(run.run_id)}>
                        View Examples
                      </Button>
                    ) : (
                      <p>--</p>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        ) : (
          <p>No eval runs available.</p>
        )}

        <div className="my-8"></div>

        <h1 className="text-2xl font-bold mt-8 mb-4">Available Evals</h1>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner size="lg" />
          </div>
        ) : evals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {evals.map((evalItem) => (
              <EvalCard
                key={evalItem.name}
                title={evalItem.name}
                description={evalItem.description}
                type={evalItem.type}
                numSamples={evalItem.num_samples}
                paperLink={evalItem.paper_link}
                onRun={(workflowId: string, numSamples: number, outputVariable: string) =>
                  handleLaunchEval(workflowId, evalItem.name, numSamples, outputVariable)
                }
              />
            ))}
          </div>
        ) : (
          <p>No evals available.</p>
        )}
      </div>
      {alert.isVisible && (
        <div className="fixed bottom-4 right-4 z-50">
          <Alert color={alert.color}>
            {alert.message}
          </Alert>
        </div>
      )}
    </div>
  );
};

export default EvalsPage;
