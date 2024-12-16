import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Header from "../../components/Header";
import { getEvalRunStatus } from "../../utils/api";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Spinner, Chip, Modal, ModalContent, ModalHeader, ModalBody, Button, useDisclosure, Alert } from "@nextui-org/react";
import { Icon } from "@iconify/react";

interface PerExampleResult {
  example_id?: string;
  task_id?: string;
  prompt: string;
  predicted_answer: string;
  ground_truth_answer: string;
  is_correct: boolean;
}

interface EvalResults {
  run_id: string;
  eval_name: string;
  accuracy: number;
  per_example_results: PerExampleResult[];
}

interface EvalRunData {
  run_id: string;
  eval_name: string;
  results: {
    accuracy: number;
    subset_metrics?: {
      default?: {
        per_example_results: PerExampleResult[];
      };
    };
  };
}

interface AlertState {
  message: string;
  color: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  isVisible: boolean;
}

const EvalResultsPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const [results, setResults] = useState<EvalResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [alert, setAlert] = useState<AlertState>({ message: '', color: 'default', isVisible: false });

  const showAlert = (message: string, color: AlertState['color']) => {
    setAlert({ message, color, isVisible: true });
    setTimeout(() => setAlert(prev => ({ ...prev, isVisible: false })), 3000);
  };

  useEffect(() => {
    const fetchResults = async () => {
      if (!id) return;

      try {
        const evalRunData = await getEvalRunStatus(id as string);
        const normalizedResults: EvalResults = {
          run_id: evalRunData.run_id,
          eval_name: evalRunData.eval_name,
          accuracy: evalRunData.results?.accuracy || 0,
          per_example_results: evalRunData.results?.subset_metrics?.default?.per_example_results || []
        };

        setResults(normalizedResults);
      } catch (error) {
        console.error("Error fetching eval results:", error);
        showAlert("Failed to fetch eval results", "danger");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [id]);

  const renderPrompt = (prompt: string) => {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm max-h-32 overflow-y-auto flex-grow">
          <p>{prompt}</p>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPrompt(prompt);
            onOpen();
          }}
        >
          <Icon icon="solar:full-screen-linear" className="w-4 h-4" />
        </Button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header activePage="evals" />
        <div className="flex justify-center items-center h-[calc(100vh-64px)]">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (!results || !results.per_example_results) {
    return (
      <div className="min-h-screen">
        <Header activePage="evals" />
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">Eval Run Results</h1>
          <p>No results available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header activePage="evals" />
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Eval Run Results</h1>
            <div className="text-gray-600 mt-2">
              Run ID: {results.run_id} • Eval: {results.eval_name}
            </div>
          </div>
          <Chip
            color="success"
            variant="flat"
            size="lg"
          >
            Accuracy: {(results.accuracy * 100).toFixed(1)}%
          </Chip>
        </div>

        <Table aria-label="Eval results table" isHeaderSticky isStriped fullWidth>
          <TableHeader>
            <TableColumn>Example ID</TableColumn>
            <TableColumn width="40%">Prompt</TableColumn>
            <TableColumn>Predicted</TableColumn>
            <TableColumn>Ground Truth</TableColumn>
            <TableColumn>Status</TableColumn>
          </TableHeader>
          <TableBody items={results.per_example_results}>
            {(item) => (
              <TableRow key={item.example_id || item.task_id || `result-${item.predicted_answer}-${item.ground_truth_answer}`}>
                <TableCell>{item.example_id || item.task_id}</TableCell>
                <TableCell>
                  <div className="max-h-32 overflow-y-auto">
                    {renderPrompt(item.prompt)}
                  </div>
                </TableCell>
                <TableCell>
                  {item.predicted_answer}
                </TableCell>
                <TableCell>
                  {item.ground_truth_answer}
                </TableCell>
                <TableCell>
                  <Chip
                    color={item.is_correct ? "success" : "danger"}
                    variant="flat"
                  >
                    {item.is_correct ? "Correct" : "Incorrect"}
                  </Chip>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        classNames={{
          base: "max-w-[90%] h-[75vh] m-auto",
          wrapper: "w-[90%]",
          body: "p-5"
        }}
        scrollBehavior="inside"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Prompt</ModalHeader>
              <ModalBody className="whitespace-pre-wrap overflow-y-auto">
                {selectedPrompt}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

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

export default EvalResultsPage;
