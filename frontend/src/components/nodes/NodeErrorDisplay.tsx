import CodeEditor from '@/components/CodeEditor'
import React from 'react'

interface NodeErrorDisplayProps {
    error: string
}

const NodeErrorDisplay: React.FC<NodeErrorDisplayProps> = ({ error }) => {
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
                    <CodeEditor
                        code={error}
                        onChange={() => {}}
                        disabled={true}
                        mode="python"
                        label=""
                        modalSize="full"
                    />
                </div>
            </div>
        </div>
    )
}

export default NodeErrorDisplay
