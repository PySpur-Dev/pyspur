'use client'

import { createTestSession, getSession } from '@/utils/api'
import { ScrollShadow } from '@heroui/react'
import { useTheme } from 'next-themes'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useChatWorkflowExecution } from '../../hooks/useChatWorkflowExecution'
import MessageCard from './MessageCard'
import PromptInputWithRegenerateButton from './PromptInputWithRegenerateButton'

interface ChatProps {
    workflowID?: string
    onSendMessage?: (message: string) => Promise<void>
    sessionId?: string
}

interface MessageCardProps {
    message: string
    messageClassName?: string
    status?: string
    avatar: string
}

// Use React.memo to prevent unnecessary re-renders
const Chat = React.memo(function Chat({ workflowID, onSendMessage, sessionId: providedSessionId }: ChatProps) {
    const [messages, setMessages] = useState<Array<{ role: string; message: string; runId?: string }>>([])
    const scrollRef = useRef<HTMLDivElement>(null)
    const { theme } = useTheme()
    // Add state for test session
    const [sessionId, setSessionId] = useState<string | null>(providedSessionId || null)

    // Create test session when workflow ID is available and no sessionId is provided
    const initTestSession = async () => {
        if (workflowID && !providedSessionId) {
            try {
                const session = await createTestSession(workflowID)
                setSessionId(session.id)
            } catch (error) {
                console.error('Error creating test session:', error)
            }
        }
    }

    // Fetch session messages when providedSessionId exists
    const fetchSessionMessages = async () => {
        if (!providedSessionId) return

        try {
            const session = await getSession(providedSessionId)
            const formattedMessages = session.messages.map((msg) => ({
                role: msg.content.role,
                message: msg.content.content,
                runId: msg.run_id,
            }))
            setMessages(formattedMessages)
        } catch (error) {
            console.error('Error fetching session messages:', error)
        }
    }

    useEffect(() => {
        if (providedSessionId) {
            fetchSessionMessages()
        } else {
            initTestSession()
        }
    }, [workflowID, providedSessionId])

    // Load messages from session storage on initial load - only for test sessions
    useEffect(() => {
        if (workflowID && !providedSessionId) {
            const storedMessages = sessionStorage.getItem(`chat_messages_${sessionId || 'default'}`)
            if (storedMessages) {
                try {
                    setMessages(JSON.parse(storedMessages))
                } catch (e) {
                    console.error('Error parsing stored messages:', e)
                }
            }
        }
    }, [sessionId, providedSessionId])

    // Save messages to session storage when they change - only for test sessions
    useEffect(() => {
        if (workflowID && !providedSessionId && messages.length > 0) {
            sessionStorage.setItem(`chat_messages_${sessionId}`, JSON.stringify(messages))
        }
    }, [messages, workflowID, providedSessionId])

    // Use our custom hook for workflow execution
    const { isLoading, error, executeWorkflow, cleanup } = useChatWorkflowExecution({
        workflowID,
        sessionId,
    })

    const getAssistantAvatar = () => {
        return '/pyspur-black.png'
    }

    // Function to handle sending a new message - use useCallback to make it stable
    const handleSendMessage = useCallback(
        async (messageText: string) => {
            if (!messageText.trim()) return

            // Add user message to local state
            const userMessage = {
                role: 'user',
                message: messageText,
            }

            setMessages((prev) => [...prev, userMessage])

            try {
                // If onSendMessage prop exists, use it (for custom handlers)
                if (onSendMessage) {
                    await onSendMessage(messageText)
                }

                // Execute the workflow with the message
                if (workflowID) {
                    const response = await executeWorkflow(messageText)

                    // Add the assistant's response if we got one
                    if (response) {
                        setMessages((prev) => [...prev, response])
                    }
                } else {
                    // Fallback for when no workflow is connected
                    setTimeout(() => {
                        const botMessage = {
                            role: 'assistant',
                            message: `This is a simulated response (no workflow connected): "${messageText}"`,
                        }
                        setMessages((prev) => [...prev, botMessage])
                    }, 1000)
                }
            } catch (err) {
                console.error('Error sending message:', err)
                // Add an error message
                setMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        message: 'Sorry, an error occurred while processing your message.',
                    },
                ])
            }
        },
        [onSendMessage, workflowID, executeWorkflow]
    )

    // Handle clearing the chat history
    const handleClearChat = useCallback(async () => {
        if (workflowID) {
            sessionStorage.removeItem(`chat_messages_${sessionId || 'default'}`)
        }
        setMessages([])
        await initTestSession()
    }, [workflowID])

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isLoading])

    // Clean up intervals when component unmounts
    useEffect(() => {
        return () => {
            cleanup()
        }
    }, [cleanup])

    // Custom conversation component
    const CustomConversation = useCallback(() => {
        if (messages.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] h-full p-4 text-center">
                    <div className="mb-4">
                        <img src="/pyspur_white.png" alt="PySpur Chat" className="w-16 h-16 dark:block hidden" />
                        <img src="/pyspur-black.png" alt="PySpur Chat" className="w-16 h-16 dark:hidden block" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Welcome to Spur Chat</h3>
                    <p className="text-default-500 mb-4 max-w-md">
                        {workflowID
                            ? 'This chat is powered by your workflow. Send a message to get started!'
                            : 'No workflow is connected yet. Please connect a workflow to use this chat interface.'}
                    </p>
                    {!workflowID && (
                        <p className="text-xs text-default-400 mb-2">
                            Tip: Build a workflow that takes a message input and produces a response output.
                        </p>
                    )}
                </div>
            )
        }

        return (
            <div className="flex flex-col gap-2 px-1">
                {messages.map((message, index) => (
                    <MessageCard
                        key={index}
                        avatar={
                            message.role === 'assistant'
                                ? getAssistantAvatar()
                                : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjYiIHI9IjQiIGZpbGw9ImN1cnJlbnRDb2xvciIvPjxwYXRoIGZpbGw9ImN1cnJlbnRDb2xvciIgZD0iTTIwIDE3LjVjMCAyLjQ4NSAwIDQuNS04IDQuNXMtOC0yLjAxNS04LTQuNVM3LjU4MiAxMyAxMiAxM3M4IDIuMDE1IDggNC41Ii8+PC9zdmc+'
                        }
                        message={message.message}
                        messageClassName={message.role === 'user' ? 'bg-content3 text-content3-foreground' : ''}
                        className="py-0"
                        runId={message.role === 'assistant' ? message.runId : undefined}
                    />
                ))}

                {isLoading && (
                    <MessageCard
                        avatar={getAssistantAvatar()}
                        message="Thinking..."
                        status="loading"
                        className="py-0"
                    />
                )}

                {error && (
                    <MessageCard
                        avatar={getAssistantAvatar()}
                        message={`Error: ${error}`}
                        messageClassName="bg-danger-100 text-danger-700"
                        className="py-0"
                    />
                )}
            </div>
        )
    }, [messages, isLoading, error, workflowID, theme])

    // Custom PromptInput with our handler
    const CustomPromptInput = useCallback(() => {
        return (
            <PromptInputWithRegenerateButton
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                placeholder={workflowID ? 'Send a message...' : 'No workflow connected'}
                disabled={!workflowID}
                showRegenerateButton={false}
            />
        )
    }, [handleSendMessage, isLoading, workflowID])

    return (
        <div className="flex h-full w-full max-w-full flex-col">
            <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b-small border-divider py-1 px-4 flex-shrink-0">
                <p className="text-sm font-medium">Chat with your Spur</p>
                <div className="flex items-center gap-2">
                    {messages.length > 0 && (
                        <button
                            onClick={handleClearChat}
                            className="text-xs text-default-500 hover:text-default-700"
                            aria-label="Clear chat history"
                        >
                            Clear chat
                        </button>
                    )}
                    <p className="text-xs text-default-400">
                        {sessionId ? `Session ID: ${sessionId}` : 'No active session'}
                    </p>
                </div>
            </div>

            <ScrollShadow className="flex flex-col p-2 overflow-y-auto flex-grow" ref={scrollRef}>
                <CustomConversation />
            </ScrollShadow>

            <div className="p-2 border-t border-divider flex-shrink-0">
                <CustomPromptInput />
            </div>
        </div>
    )
})

export default Chat
