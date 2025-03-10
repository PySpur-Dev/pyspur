import React, { useState } from 'react'
import Markdown from 'react-markdown'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/cjs/prism'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { Icon } from '@iconify/react'

import JsonView from 'react18-json-view'
import 'react18-json-view/src/style.css'

interface NodeOutputDisplayProps {
    output: Record<string, any>
    maxHeight?: string | number
}

// Add a helper function to generate a simple hash for content
const generateContentHash = (content: string): string => {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
};

const NodeOutputDisplay: React.FC<NodeOutputDisplayProps> = ({ output, maxHeight = '500px' }) => {
    const [copiedKey, setCopiedKey] = useState<string | null>(null)

    const copyToClipboard = async (text: string | any, key: string) => {
        try {
            await navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2))
            setCopiedKey(key)
            setTimeout(() => setCopiedKey(null), 2000) // Reset after 2 seconds
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const detectLanguage = (code: string): string => {
        // Count occurrences of language-specific patterns
        let pythonScore = 0
        let cppScore = 0
        let tsScore = 0
        let jsScore = 0

        // Python indicators with stronger patterns
        if (code.match(/^(from|import)\s+[\w.]+(\s+import\s+[\w.]+)?$/m)) pythonScore += 3
        if (code.match(/def\s+\w+\s*\([^)]*\)\s*:/)) pythonScore += 3
        if (code.match(/class\s+\w+(\s*\([^)]*\))?\s*:/)) pythonScore += 3
        if (code.match(/^\s*@\w+/m)) pythonScore += 2 // Decorators
        if (code.match(/^\s*if\s+__name__\s*==\s*['"]__main__['"]/m)) pythonScore += 3

        // C++ indicators with stronger patterns
        if (code.match(/#include\s*<[^>]+>/)) cppScore += 3
        if (code.match(/\b(std::|\bvector<|template\s*<)/)) cppScore += 3
        if (code.match(/\b(public|private|protected):/)) cppScore += 2
        if (code.match(/\b(int|void|bool|char|double|float|long)\s+\w+\s*\([^)]*\)\s*{/)) cppScore += 3

        // TypeScript indicators with stronger patterns
        if (code.match(/interface\s+\w+\s*{/)) tsScore += 3
        if (code.match(/type\s+\w+\s*=\s*{/)) tsScore += 3
        if (code.match(/([\w\s,]+):\s*(string|number|boolean|any)\b/)) tsScore += 2
        if (code.match(/import\s*{\s*[\w\s,]+\s*}\s*from/)) tsScore += 2

        // JavaScript indicators with stronger patterns
        if (code.match(/const\s+\w+\s*=\s*require\(/)) jsScore += 3
        if (code.match(/module\.exports\s*=/)) jsScore += 3
        if (code.match(/function\s*\w+\s*\([^)]*\)\s*{/)) jsScore += 2
        if (code.match(/new\s+Promise\s*\(/)) jsScore += 2

        // Get the highest scoring language
        const scores = [
            { lang: 'python', score: pythonScore },
            { lang: 'cpp', score: cppScore },
            { lang: 'typescript', score: tsScore },
            { lang: 'javascript', score: jsScore },
        ]

        const highestScore = Math.max(...scores.map((s) => s.score))

        // Only return a language if we have a reasonable confidence
        if (highestScore >= 3) {
            return scores.find((s) => s.score === highestScore)!.lang
        }

        // If no strong indicators, don't assume it's code
        return ''
    }

    const isCodeBlock = (value: any): boolean => {
        if (typeof value !== 'string') return false
        if (!value.includes('\n')) return false // Must be multiline

        // Detect if it's a data structure or configuration format
        if (value.trim().startsWith('{') && value.trim().endsWith('}')) {
            try {
                JSON.parse(value)
                return true // Valid JSON
            } catch (e) {
                // Not JSON, continue checking
            }
        }

        // Count strong code indicators
        let codeScore = 0

        // Strong indicators (weighted more heavily)
        if (value.match(/^(import|from)\s+[\w.]+(\s+import\s+[\w.]+)?$/m)) codeScore += 3
        if (value.match(/^(class|def|function)\s+\w+\s*[\({]/m)) codeScore += 3
        if (value.match(/#include\s*<[^>]+>/)) codeScore += 3
        if (value.match(/\b(public|private|protected):/)) codeScore += 3
        if (value.match(/^interface\s+\w+\s*{/m)) codeScore += 3
        if (value.match(/^type\s+\w+\s*=/m)) codeScore += 3

        // Medium indicators
        if (value.match(/^(const|let|var)\s+\w+\s*=/m)) codeScore += 2
        if (value.match(/=>\s*{/)) codeScore += 2
        if (value.match(/^export\s+(default\s+)?/m)) codeScore += 2
        if (value.match(/^@\w+/m)) codeScore += 2 // Decorators

        // Weak indicators (only count if we already have some score)
        if (codeScore > 0) {
            if (value.includes(';')) codeScore += 1
            if (value.match(/[{}\[\]()]/g)) codeScore += 1
            if (value.match(/^\s*\/\//m)) codeScore += 1 // Comments
            if (value.match(/^\s*return\s+/m)) codeScore += 1
        }

        // Check for common non-code patterns
        const nonCodeIndicators = [
            /^[\s-]*Dear\s+\w+/i, // Letters/emails
            /^(Hi|Hello|Hey)\s+\w+/i, // Conversational text
            /^[\s-]*Chapter\s+\d+/i, // Book chapters
            /^\d+\.\s+[\w\s]+$/m, // Numbered lists
            /^[A-Z][^.!?]+[.!?]\s*$/m, // Regular sentences
        ]

        if (nonCodeIndicators.some((pattern) => pattern.test(value))) {
            return false
        }

        // Require a minimum score to consider it code
        return codeScore >= 3
    }

    // JSON rendering logic with indentation
    const renderJsonObject = (obj: Record<string, any>) => {
        return (
            <div style={{ width: '100%' }}>
                <JsonView src={obj} />
            </div>
        )
    }
    const renderValue = (value: any) => {
        // Handle model provider errors
        if (typeof value === 'string') {
            try {
                const parsedValue = JSON.parse(value)
                if (parsedValue.type === 'model_provider_error') {
                    // Map error types to icons and colors
                    const errorConfig = {
                        overloaded: {
                            icon: 'solar:server-path-broken-linear',
                            color: 'warning',
                        },
                        rate_limit: {
                            icon: 'solar:clock-circle-linear',
                            color: 'warning',
                        },
                        context_length: {
                            icon: 'solar:document-broken-linear',
                            color: 'danger',
                        },
                        auth: {
                            icon: 'solar:key-linear',
                            color: 'danger',
                        },
                        service_unavailable: {
                            icon: 'solar:server-linear',
                            color: 'warning',
                        },
                        unknown: {
                            icon: 'solar:danger-triangle-linear',
                            color: 'danger',
                        },
                    }

                    const config = errorConfig[parsedValue.error_type as keyof typeof errorConfig] || errorConfig.unknown
                    const colorClass = config.color === 'warning' ? 'warning' : 'danger'

                    return (
                        <div className={`p-4 bg-${colorClass}-50 border border-${colorClass}-200 rounded-lg`}>
                            <div className="flex items-center mb-2">
                                <Icon icon={config.icon} className={`text-${colorClass}-500 mr-2`} width={24} />
                                <span className={`font-semibold text-${colorClass}-700`}>
                                    {parsedValue.provider.toUpperCase()} Model Error
                                </span>
                            </div>
                            <p className={`text-${colorClass}-700`}>{parsedValue.message}</p>
                        </div>
                    )
                }
            } catch (e) {
                // Not a JSON string, continue with normal rendering
            }
        }

        // Handle JSON objects recursively
        if (typeof value === 'object' && value !== null) {
            return renderJsonObject(value)
        }

        // Try parsing string as JSON
        if (typeof value === 'string') {
            try {
                const jsonValue = JSON.parse(value)
                if (typeof jsonValue === 'object' && jsonValue !== null) {
                    return renderJsonObject(jsonValue)
                }
            } catch (e) {
                // Not valid JSON, continue with other checks
            }
        }

        // Handle code blocks
        if (isCodeBlock(value)) {
            const language = detectLanguage(value)
            const codeKey = `code-${generateContentHash(value)}`
            return (
                <div className="group">
                    <SyntaxHighlighter
                        language={language}
                        style={oneDark}
                        customStyle={{ borderRadius: '8px', padding: '12px' }}
                    >
                        {value}
                    </SyntaxHighlighter>
                    <div className="flex justify-end mt-3">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(value, codeKey);
                            }}
                            className="px-3 py-1.5 rounded-md bg-white/10 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all flex items-center gap-2 border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                            title="Copy to clipboard"
                        >
                            <Icon
                                icon={copiedKey === codeKey ? 'solar:check-circle-bold' : 'solar:copy-linear'}
                                className={copiedKey === codeKey ? 'text-green-500 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}
                                width={16}
                            />
                        </button>
                    </div>
                </div>
            )
        }
        // Handle data URIs
        if (typeof value === 'string' && value.startsWith('data:')) {
            const [header, data] = value.split(',')
            const mimeType = header.split(';')[0].split(':')[1]

            // Handle PDF files
            if (mimeType === 'application/pdf') {
                return (
                    <iframe
                        src={value}
                        style={{ width: '100%', height: '500px', border: 'none' }}
                        title="PDF Preview"
                    />
                )
            }

            // Handle images
            if (mimeType.startsWith('image/')) {
                return <img src={value} alt="Image Preview" style={{ maxWidth: '100%', maxHeight: '500px' }} />
            }

            // Handle video
            if (mimeType.startsWith('video/')) {
                return (
                    <video controls style={{ maxWidth: '100%', maxHeight: '500px' }}>
                        <source src={value} type={mimeType} />
                        Your browser does not support the video tag.
                    </video>
                )
            }

            // Handle audio
            if (mimeType.startsWith('audio/')) {
                return (
                    <audio controls style={{ width: '100%' }}>
                        <source src={value} type={mimeType} />
                        Your browser does not support the audio tag.
                    </audio>
                )
            }

            // Handle text files
            if (mimeType.startsWith('text/')) {
                try {
                    const decodedText = atob(data)
                    if (isCodeBlock(decodedText)) {
                        const language = detectLanguage(decodedText)
                        return (
                            <SyntaxHighlighter
                                language={language}
                                style={oneDark}
                                customStyle={{
                                    margin: 0,
                                    borderRadius: '8px',
                                    padding: '12px',
                                }}
                            >
                                {decodedText}
                            </SyntaxHighlighter>
                        )
                    }
                    return <Markdown>{decodedText}</Markdown>
                } catch (e) {
                    console.error('Error decoding base64:', e)
                    return <div>Error decoding content</div>
                }
            }

            return <div>Unsupported data URI format</div>
        }

        // Handle file URLs and local paths
        if (
            typeof value === 'string' &&
            (value.startsWith('http://') ||
                value.startsWith('https://') ||
                value.startsWith('test_files/') ||
                value.startsWith('run_files/'))
        ) {
            if (value.startsWith('test_files/') || value.startsWith('run_files/')) {
                // files stored on the server can be accessed via the /api/files/ endpoint
                value = window.location.origin + '/' + 'api/files/' + value
            }
            // We'll do some basic checks for file type based on extension:
            const extension = (value.split('.').pop() || '').toLowerCase()

            // For PDFs
            if (extension === 'pdf') {
                return (
                    <iframe
                        src={value}
                        style={{ width: '100%', height: '500px', border: 'none' }}
                        title="PDF Preview"
                    />
                )
            }

            // For images (png, jpg, jpeg, gif, etc.)
            if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) {
                return <img src={value} alt="Image Preview" style={{ maxWidth: '100%', maxHeight: '500px' }} />
            }

            // For videos (mp4, webm, ogv, etc.)
            if (['mp4', 'webm', 'ogg', 'ogv'].includes(extension)) {
                return (
                    <video controls style={{ maxWidth: '100%', maxHeight: '500px' }}>
                        <source src={value} />
                        Your browser does not support the video tag.
                    </video>
                )
            }

            // For audio (mp3, wav, etc.)
            if (['mp3', 'wav', 'ogg'].includes(extension)) {
                return (
                    <audio controls style={{ width: '100%' }}>
                        <source src={value} />
                        Your browser does not support the audio tag.
                    </audio>
                )
            }

            // Default fallback – just show a link
            return (
                <div>
                    <iframe
                        src={value}
                        style={{ width: '100%', height: 'auto', border: 'none', display: 'none' }}
                        sandbox="allow-scripts allow-same-origin allow-popups"
                        onLoad={(e) => {
                            e.currentTarget.style.display = 'block'
                        }}
                        onError={(e) => {
                            // Keep iframe hidden on error
                            e.currentTarget.style.display = 'none'
                        }}
                    />
                    <a href={value} target="_blank" rel="noopener noreferrer">
                        {value}
                    </a>
                </div>
            )
        }

        // Process value for markdown rendering
        const processValue = (val: any): string => {
            if (typeof val === 'string') {
                // Preserve existing heading markers (#, ##, ###)
                if (val.match(/^#+\s/m)) {
                    return val;
                }
                // For object keys that should be headings, use appropriate heading level
                if (val.match(/^[A-Z][^a-z:]+(?:\s[A-Z][^a-z:]+)*:?$/)) {
                    return `### ${val}`;
                }
                return val;
            }
            if (typeof val === 'object' && val !== null) {
                return Object.entries(val)
                    .map(([k, v]) => {
                        // Make top-level keys larger headings
                        if (k.match(/^[A-Z][^a-z:]+(?:\s[A-Z][^a-z:]+)*:?$/)) {
                            return `## ${k}\n\n${processValue(v)}`;
                        }
                        return `**${k}**: ${processValue(v)}`;
                    })
                    .join('\n\n');
            }
            return String(val);
        };

        const content = processValue(value);
        const textKey = `text-${generateContentHash(content)}`;
        return (
            <div className="group">
                <Markdown>{content}</Markdown>
                <div className="flex justify-end mt-3">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(content, textKey);
                        }}
                        className="px-3 py-1.5 rounded-md bg-white/10 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all flex items-center gap-2 border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                        title="Copy to clipboard"
                    >
                        <Icon
                            icon={copiedKey === textKey ? 'solar:check-circle-bold' : 'solar:copy-linear'}
                            className={copiedKey === textKey ? 'text-green-500 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}
                            width={16}
                        />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            {output && (
                <div
                    className="p-5"
                    style={{
                        overflowY: 'auto',
                        touchAction: 'none',
                        maxHeight: maxHeight
                    }}
                    onWheelCapture={(e) => {
                        e.stopPropagation()
                    }}
                >
                    <div>
                        {Object.entries(output).map(([key, value]) => (
                            <div key={key} className="my-2 flex flex-col items-start">
                                <label className="text-sm font-semibold mb-1 block">{key}:</label>
                                <div className="ml-2 mt-auto w-full">{renderValue(value)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

export default NodeOutputDisplay
