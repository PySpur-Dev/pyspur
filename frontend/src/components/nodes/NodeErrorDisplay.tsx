import React, { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import CodeEditor from '@/components/CodeEditor'
import { json } from '@codemirror/lang-json'

interface NodeErrorDisplayProps {
    error: string
}

interface ParsedJsonError {
    type: string;
    message: string;
    original_response?: string;
    validation_error?: string;
}

const NodeErrorDisplay: React.FC<NodeErrorDisplayProps> = ({ error }) => {
    // Try to parse the error message if it's in JSON format
    const errorData = useMemo(() => {
        try {
            // Try to find a valid JSON object within the error message
            const jsonMatch = error.match(/{[\s\S]*}/);
            if (jsonMatch) {
                const parsedError = JSON.parse(jsonMatch[0]) as ParsedJsonError;
                return parsedError;
            }
        } catch (e) {
            // If parsing fails, we'll fall back to displaying the raw error
        }
        return null;
    }, [error]);

    // Special handling for LLM invalid JSON format errors
    if (errorData && errorData.type === 'invalid_json_format') {
        return (
            <div
                className="p-5"
                style={{
                    overflowY: 'auto',
                    touchAction: 'none',
                }}
                onWheelCapture={(e) => {
                    e.stopPropagation()
                }}
            >
                <div className="my-2 flex flex-col items-start">
                    <label className="text-sm font-semibold mb-1 text-danger block">LLM Response Error:</label>
                    <p className="mb-3">The Large Language Model returned a response that doesn&apos;t match the expected JSON format.</p>

                    {errorData.original_response && (
                        <div className="w-full mb-3">
                            <label className="text-sm font-semibold mb-1 block">Original LLM Response:</label>
                            <div className="ml-2 mt-auto w-full bg-code-bg rounded-md p-2">
                                <CodeEditor
                                    code={errorData.original_response}
                                    onChange={() => {}}
                                    disabled={true}
                                    mode="json"
                                    label=""
                                    modalSize="full"
                                />
                            </div>
                        </div>
                    )}

                    {errorData.validation_error && (
                        <div className="w-full">
                            <label className="text-sm font-semibold mb-1 block">Validation Error:</label>
                            <p className="ml-2 text-sm text-danger">{errorData.validation_error}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Default error display for other types of errors
    return (
        <div
            className="p-5"
            style={{
                overflowY: 'auto',
                touchAction: 'none',
            }}
            onWheelCapture={(e) => {
                e.stopPropagation()
            }}
        >
            <div className="my-2 flex flex-col items-start">
                <label className="text-sm font-semibold mb-1 text-danger block">Error:</label>
                <div className="ml-2 mt-auto w-full">
                    <CodeEditor code={error} onChange={() => {}} disabled={true} mode="python" label="" modalSize="full" />
                </div>
            </div>
        </div>
    )
}

export default NodeErrorDisplay
