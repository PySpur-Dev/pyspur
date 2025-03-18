import { FlowState } from '@/types/api_types/flowStateSchema'
import { TestInput } from '@/types/api_types/workflowSchemas'
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Tooltip,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import React, { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import SyntaxHighlighter, { oneDark } from 'react-syntax-highlighter'

interface DeployModalProps {
    isOpen: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
    workflowId: string
    testInput: TestInput
}

interface RootState {
    flow: FlowState
}

type SupportedLanguages = 'shell' | 'python' | 'javascript' | 'typescript' | 'rust' | 'java' | 'cpp'

const DeployModal: React.FC<DeployModalProps> = ({ isOpen, onOpenChange, workflowId, testInput }) => {
    const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguages>('python')
    const [apiCallType, setApiCallType] = useState<'blocking' | 'non-blocking'>('non-blocking')
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const nodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs)
    const inputNode = nodes.find((node) => node.type === 'InputNode')
    const workflowInputVariables = inputNode ? nodeConfigs[inputNode.id]?.output_schema || {} : {}

    const getApiEndpoint = (): string => {
        if (typeof window === 'undefined') {
            return ''
        }
        const baseUrl = window.location.origin
        if (apiCallType === 'non-blocking') {
            return `${baseUrl}/api/wf/${workflowId}/start_run/?run_type=non_blocking`
        } else {
            return `${baseUrl}/api/wf/${workflowId}/run/?run_type=blocking`
        }
    }

    // Create example request body with the actual input variables
    const exampleRequestBody = {
        initial_inputs: {
            [inputNode?.data.title]: Object.keys(workflowInputVariables).reduce<Record<string, any>>((acc, key) => {
                acc[key] = testInput?.hasOwnProperty(key)
                    ? testInput[key]
                    : workflowInputVariables[key].type === 'number'
                      ? 0
                      : workflowInputVariables[key].type === 'boolean'
                        ? false
                        : 'example_value'
                return acc
            }, {}),
        },
    }

    const getCodeExample = (language: SupportedLanguages): string => {
        const endpoint = getApiEndpoint()
        const requestBody = JSON.stringify(exampleRequestBody, null, 2)

        const examples: Record<SupportedLanguages, string> = {
            shell: `curl -X POST ${endpoint} \\
    -H "Content-Type: application/json" \\
    -d '${requestBody}'`,

            python: `import requests

url = '${endpoint}'
data = ${requestBody}

response = requests.post(url, json=data)

print(response.status_code)
print(response.json())`,

            javascript: `fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${JSON.stringify(exampleRequestBody)})
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`,

            typescript: `async function runWorkflow() {
  const response = await fetch('${endpoint}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(${JSON.stringify(exampleRequestBody)})
  });

  const data = await response.json();
  console.log(data);
}`,

            rust: `use reqwest;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client
        .post("${endpoint}")
        .json(&${JSON.stringify(exampleRequestBody)})
        .send()
        .await?;

    println!("Status: {}", response.status());
    println!("Response: {}", response.text().await?);
    Ok(())
}`,

            java: `import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;

public class WorkflowClient {
    public static void main(String[] args) throws Exception {
        String requestBody = ${JSON.stringify(JSON.stringify(exampleRequestBody))};

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${endpoint}"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody))
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());

        System.out.println(response.statusCode());
        System.out.println(response.body());
    }
}`,

            cpp: `#include <cpr/cpr.h>
#include <iostream>

int main() {
    cpr::Response r = cpr::Post(
        cpr::Url{"${endpoint}"},
        cpr::Header{{"Content-Type", "application/json"}},
        cpr::Body{R"(${JSON.stringify(exampleRequestBody)})"});

    std::cout << "Status code: " << r.status_code << std::endl;
    std::cout << "Response: " << r.text << std::endl;

    return 0;
}`,
        }

        return examples[language]
    }

    const getStatusEndpoint = (): string => {
        if (typeof window === 'undefined') {
            return ''
        }
        const baseUrl = window.location.origin
        return `${baseUrl}/api/runs/{run_id}/status/`
    }

    const getStatusCheckExample = (language: SupportedLanguages): string => {
        const endpoint = getStatusEndpoint()

        const examples: Record<SupportedLanguages, string> = {
            shell: `curl ${endpoint.replace('{run_id}', 'YOUR_RUN_ID')}`,

            python: `import requests

url = '${endpoint.replace('{run_id}', 'YOUR_RUN_ID')}'

response = requests.get(url)
print(response.json())`,

            javascript: `fetch('${endpoint.replace('{run_id}', 'YOUR_RUN_ID')}')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`,

            typescript: `async function checkRunStatus(runId: string) {
  const response = await fetch('${endpoint.replace('{run_id}', '')}' + runId);
  const data = await response.json();
  console.log(data);
}`,

            rust: `use reqwest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client
        .get("${endpoint.replace('{run_id}', 'YOUR_RUN_ID')}")
        .send()
        .await?;

    println!("Response: {}", response.text().await?);
    Ok(())
}`,

            java: `import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;

public class StatusCheck {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${endpoint.replace('{run_id}', 'YOUR_RUN_ID')}"))
            .GET()
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());

        System.out.println(response.body());
    }
}`,

            cpp: `#include <cpr/cpr.h>
#include <iostream>

int main() {
    cpr::Response r = cpr::Get(
        cpr::Url{"${endpoint.replace('{run_id}', 'YOUR_RUN_ID')}"});

    std::cout << "Response: " << r.text << std::endl;
    return 0;
}`,
        }

        return examples[language]
    }

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onOpenChange(false)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onOpenChange])

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="full">
            <ModalContent>
                <ModalHeader>
                    <div>API Endpoint Information</div>
                </ModalHeader>

                <ModalBody className="max-h-[60vh] overflow-y-auto">
                    <div className="flex flex-col space-y-4">
                        <div className="flex items-center gap-2">
                            <span>API call type:</span>
                            <Select
                                label=""
                                className="max-w-[150px]"
                                size="sm"
                                variant="bordered"
                                value={apiCallType}
                                onChange={(e) => setApiCallType(e.target.value as 'blocking' | 'non-blocking')}
                                defaultSelectedKeys={['non-blocking']}
                            >
                                <SelectItem key="blocking" value="blocking">
                                    Blocking
                                </SelectItem>
                                <SelectItem key="non-blocking" value="non-blocking">
                                    Non-blocking
                                </SelectItem>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Language:</span>
                            <Select
                                label=""
                                className="max-w-[150px]"
                                size="sm"
                                variant="bordered"
                                value={selectedLanguage}
                                onChange={(e) => setSelectedLanguage(e.target.value as SupportedLanguages)}
                                defaultSelectedKeys={['python']}
                            >
                                {['shell', 'python', 'javascript', 'typescript', 'rust', 'java', 'cpp'].map((lang) => (
                                    <SelectItem key={lang} value={lang}>
                                        {lang.charAt(0).toUpperCase() + lang.slice(1)}
                                    </SelectItem>
                                ))}
                            </Select>
                        </div>
                    </div>

                    <div className="mt-4">
                        <p className="mb-2">Example request:</p>
                        <div className="flex items-center gap-2 w-full">
                            <SyntaxHighlighter
                                language={selectedLanguage}
                                style={oneDark}
                                customStyle={{
                                    margin: 0,
                                    borderRadius: '8px',
                                    padding: '12px',
                                    flex: 1,
                                }}
                            >
                                {getCodeExample(selectedLanguage)}
                            </SyntaxHighlighter>
                            <Tooltip content="Copy to clipboard">
                                <Button
                                    isIconOnly
                                    variant="light"
                                    size="sm"
                                    onClick={() => {
                                        navigator.clipboard.writeText(getCodeExample(selectedLanguage))
                                    }}
                                >
                                    <Icon icon="solar:copy-linear" width={20} />
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    {apiCallType === 'non-blocking' && (
                        <div className="mt-4">
                            <p className="mb-2">Check run status:</p>
                            <div className="flex items-center gap-2 w-full">
                                <SyntaxHighlighter
                                    language={selectedLanguage}
                                    style={oneDark}
                                    customStyle={{
                                        margin: 0,
                                        borderRadius: '8px',
                                        padding: '12px',
                                        flex: 1,
                                    }}
                                >
                                    {getStatusCheckExample(selectedLanguage)}
                                </SyntaxHighlighter>
                                <Tooltip content="Copy to clipboard">
                                    <Button
                                        isIconOnly
                                        variant="light"
                                        size="sm"
                                        onClick={() => {
                                            navigator.clipboard.writeText(getStatusCheckExample(selectedLanguage))
                                        }}
                                    >
                                        <Icon icon="solar:copy-linear" width={20} />
                                    </Button>
                                </Tooltip>
                            </div>
                        </div>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button
                        size="lg"
                        color="primary"
                        onPress={() => onOpenChange(false)}
                        endContent={<span className="text-xs opacity-70">ESC</span>}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default DeployModal
