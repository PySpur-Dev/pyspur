import React, { useState, Dispatch, SetStateAction } from 'react';
import { useSelector } from 'react-redux';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Tooltip,
  Select,
  SelectItem,
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import SyntaxHighlighter from 'react-syntax-highlighter/dist/cjs/prism';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { FlowState } from '@/store/flowSlice';
import { getWorkflowInputVariables } from '@/utils/flowUtils';

interface DeployModalProps {
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  getApiEndpoint: () => string;
}


interface RootState {
  flow: FlowState;
}

type SupportedLanguages = 'python' | 'javascript' | 'typescript' | 'rust' | 'java' | 'cpp';

const DeployModal: React.FC<DeployModalProps> = ({ isOpen, onOpenChange, getApiEndpoint }) => {
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguages>('python');

  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const nodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs);
  const workflowInputVariables = getWorkflowInputVariables(nodes, nodeConfigs);


  // Create example request body with the actual input variables
  const exampleRequestBody = {
    initial_inputs: Object.keys(workflowInputVariables).reduce<Record<string, any>>((acc, key) => {
      acc[key] = workflowInputVariables[key].type === 'number' ? 0 :
        workflowInputVariables[key].type === 'boolean' ? false :
          "example_value";
      return acc;
    }, {})
  };

  const codeExamples: Record<SupportedLanguages, string> = {
    python: `import requests

url = '${getApiEndpoint()}'
data = ${JSON.stringify(exampleRequestBody, null, 2)}

response = requests.post(url, json=data)

print(response.status_code)
print(response.json())`,

    javascript: `fetch('${getApiEndpoint()}', {
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
  const response = await fetch('${getApiEndpoint()}', {
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
        .post("${getApiEndpoint()}")
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
            .uri(URI.create("${getApiEndpoint()}"))
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
        cpr::Url{"${getApiEndpoint()}"},
        cpr::Header{{"Content-Type", "application/json"}},
        cpr::Body{R"(${JSON.stringify(exampleRequestBody)})"});

    std::cout << "Status code: " << r.status_code << std::endl;
    std::cout << "Response: " << r.text << std::endl;

    return 0;
}`
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
    >
      <ModalContent>
        <ModalHeader>
          <div>API Endpoint Information</div>
        </ModalHeader>

        <ModalBody>
          <p>Use this endpoint to run your workflow in a non-blocking way:</p>
          <div className="flex items-center gap-2 w-full">
            <SyntaxHighlighter
              language="bash"
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: '8px',
                padding: '12px',
                flex: 1,
              }}
            >
              {getApiEndpoint()}
            </SyntaxHighlighter>
            <Tooltip content="Copy to clipboard">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(getApiEndpoint());
                }}
              >
                <Icon icon="solar:copy-linear" width={20} />
              </Button>
            </Tooltip>
          </div>
          <p className="mt-2">Send a POST request with the following body:</p>
          <div className="flex items-center gap-2 w-full">
            <SyntaxHighlighter
              language="json"
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: '8px',
                padding: '12px',
                flex: 1,
              }}
            >
              {JSON.stringify(exampleRequestBody, null, 2)}
            </SyntaxHighlighter>
            <Tooltip content="Copy to clipboard">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(exampleRequestBody, null, 2));
                }}
              >
                <Icon icon="solar:copy-linear" width={20} />
              </Button>
            </Tooltip>
          </div>

          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <p>Code example:</p>
              <Select
                label="Language"
                className="max-w-[150px]"
                size="sm"
                variant="bordered"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as SupportedLanguages)}
                defaultSelectedKeys={["python"]}
              >
                {Object.keys(codeExamples).map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </SelectItem>
                ))}
              </Select>
            </div>
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
                {codeExamples[selectedLanguage]}
              </SyntaxHighlighter>
              <Tooltip content="Copy to clipboard">
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(codeExamples[selectedLanguage]);
                  }}
                >
                  <Icon icon="solar:copy-linear" width={20} />
                </Button>
              </Tooltip>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onPress={() => onOpenChange(false)}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DeployModal;