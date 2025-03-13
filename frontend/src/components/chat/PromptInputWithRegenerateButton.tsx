'use client'

import { Button, cn, Tooltip } from '@heroui/react'
import { Icon } from '@iconify/react'
import React from 'react'

import PromptInput from './PromptInput'

interface PromptInputWithRegenerateButtonProps {
    onSendMessage?: (message: string) => Promise<void>
    isLoading?: boolean
    placeholder?: string
    disabled?: boolean
    showRegenerateButton?: boolean
}

export default function PromptInputWithRegenerateButton({
    onSendMessage,
    isLoading = false,
    placeholder = 'Enter a prompt here',
    disabled = false,
    showRegenerateButton = true,
}: PromptInputWithRegenerateButtonProps) {
    const [isRegenerating, setIsRegenerating] = React.useState<boolean>(false)
    const [prompt, setPrompt] = React.useState<string>('')
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    const onRegenerate = () => {
        setIsRegenerating(true)

        setTimeout(() => {
            setIsRegenerating(false)
        }, 1000)
    }

    const handleSendMessage = () => {
        if (prompt.trim() && onSendMessage) {
            onSendMessage(prompt)
            setPrompt('')
        }
    }

    // Handle key events to support Enter for submit and Shift+Enter for new line
    const handleKeyDown = (event: React.KeyboardEvent) => {
        // If the key pressed is Enter
        if (event.key === 'Enter') {
            // If Shift is held, allow the default behavior (new line)
            if (event.shiftKey) {
                return
            }

            // Otherwise prevent default and send the message if possible
            event.preventDefault()

            if (prompt.trim() && !isLoading && !disabled) {
                handleSendMessage()
            }
        }
    }

    return (
        <div className="flex w-full flex-col gap-1">
            {showRegenerateButton && (
                <div>
                    <Button
                        isDisabled={isRegenerating || isLoading || disabled}
                        size="sm"
                        className="h-7 min-w-0 px-2"
                        startContent={
                            <Icon
                                className={cn('text-medium', isRegenerating ? 'origin-center animate-spin' : '')}
                                icon="solar:restart-linear"
                                width={14}
                            />
                        }
                        variant="flat"
                        onPress={onRegenerate}
                    >
                        <span className="text-xs">Regenerate</span>
                    </Button>
                </div>
            )}
            <form
                className="flex w-full flex-col items-start rounded-medium bg-default-100 transition-colors hover:bg-default-200/70"
                onSubmit={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                }}
            >
                <PromptInput
                    ref={textareaRef}
                    classNames={{
                        inputWrapper: '!bg-transparent shadow-none',
                        innerWrapper: 'relative',
                        input: 'pt-1 pl-2 pb-4 !pr-10 text-medium max-h-20',
                    }}
                    endContent={
                        <div className="flex items-end gap-2">
                            <Tooltip showArrow content="Send message">
                                <Button
                                    isIconOnly
                                    color={!prompt ? 'default' : 'primary'}
                                    isDisabled={!prompt || isLoading || disabled}
                                    radius="lg"
                                    size="sm"
                                    variant="solid"
                                    onPress={handleSendMessage}
                                    type="submit"
                                >
                                    <Icon
                                        className={cn(
                                            '[&>path]:stroke-[2px]',
                                            !prompt ? 'text-default-600' : 'text-primary-foreground'
                                        )}
                                        icon="solar:arrow-up-linear"
                                        width={20}
                                    />
                                </Button>
                            </Tooltip>
                        </div>
                    }
                    minRows={1}
                    maxRows={3}
                    radius="lg"
                    value={prompt}
                    variant="flat"
                    onValueChange={setPrompt}
                    isDisabled={isLoading || disabled}
                    placeholder={placeholder}
                    onKeyDown={handleKeyDown}
                />
                <div className="flex w-full flex-wrap items-center justify-between gap-2 px-2 pb-2">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            className="h-6 min-w-0 px-2"
                            startContent={
                                <Icon className="text-default-500" icon="solar:paperclip-linear" width={14} />
                            }
                            variant="flat"
                            isDisabled={isLoading || disabled}
                        >
                            <span className="text-xs">Attach</span>
                        </Button>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <p className="py-1 text-tiny text-default-400">{prompt.length}/2000</p>
                        <span className="text-xs text-default-400">⏎ to send, ⇧+⏎ for new line</span>
                    </div>
                </div>
            </form>
        </div>
    )
}
