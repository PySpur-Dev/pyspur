import { Button, Select, SelectItem, Tooltip } from '@heroui/react'
import { Icon } from '@iconify/react'
import React, { useState } from 'react'

export interface IOMapEditorProps {
    leftOptions: string[]
    rightOptions: string[]
    value: Record<string, string>
    onChange: (value: Record<string, string>) => void
    readOnly?: boolean
    leftLabel?: string
    rightLabel?: string
}

const IOMapEditor: React.FC<IOMapEditorProps> = ({
    leftOptions,
    rightOptions,
    value = {},
    onChange,
    readOnly = false,
    leftLabel = 'Input',
    rightLabel = 'Output',
}) => {
    const [newLeftKey, setNewLeftKey] = useState<string>('')

    const handleAddMapping = () => {
        if (!newLeftKey || value.hasOwnProperty(newLeftKey)) {
            return
        }

        const updatedValue = {
            ...value,
            [newLeftKey]: rightOptions[0] || '',
        }
        onChange(updatedValue)
        setNewLeftKey('')
    }

    const handleUpdateMapping = (leftKey: string, rightValue: string) => {
        const updatedValue = {
            ...value,
            [leftKey]: rightValue,
        }
        onChange(updatedValue)
    }

    const handleDeleteMapping = (leftKey: string) => {
        const updatedValue = { ...value }
        delete updatedValue[leftKey]
        onChange(updatedValue)
    }

    return (
        <div className={`io-map-editor ${readOnly ? 'opacity-75 cursor-not-allowed' : ''}`}>
            {!readOnly && (
                <div className="mb-4 flex flex-col space-y-2">
                    <div className="flex items-center space-x-4">
                        <Select
                            selectedKeys={[newLeftKey]}
                            onChange={(e) => setNewLeftKey(e.target.value)}
                            disabled={readOnly}
                            label={leftLabel}
                            placeholder={`Select ${leftLabel}`}
                            className="flex-grow"
                        >
                            {leftOptions
                                .filter((option) => !value.hasOwnProperty(option))
                                .map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                        </Select>
                        <Button
                            isIconOnly
                            radius="full"
                            variant="light"
                            onPress={handleAddMapping}
                            color="primary"
                            disabled={readOnly || !newLeftKey}
                            aria-label="Add new mapping"
                        >
                            <Icon icon="solar:add-circle-linear" width={22} />
                        </Button>
                    </div>
                </div>
            )}

            {Object.entries(value).map(([leftKey, rightValue]) => (
                <div key={leftKey} className="mb-4 flex items-center space-x-4">
                    <div className="flex-grow flex items-center space-x-2">
                        <Tooltip content={leftKey} placement="left">
                            <div className="truncate max-w-[200px] p-2 bg-default-100 rounded-lg">{leftKey}</div>
                        </Tooltip>
                        <Icon icon="solar:arrow-right-linear" className="text-default-400" width={20} />
                        <Select
                            selectedKeys={[rightValue]}
                            onChange={(e) => handleUpdateMapping(leftKey, e.target.value)}
                            disabled={readOnly}
                            aria-label={`Select ${rightLabel}`}
                            className="flex-grow"
                        >
                            {rightOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {option}
                                </SelectItem>
                            ))}
                        </Select>
                    </div>
                    {!readOnly && (
                        <Button
                            isIconOnly
                            radius="full"
                            variant="light"
                            onPress={() => handleDeleteMapping(leftKey)}
                            color="danger"
                            aria-label="Delete mapping"
                        >
                            <Icon icon="solar:trash-bin-trash-linear" width={22} />
                        </Button>
                    )}
                </div>
            ))}
        </div>
    )
}

export default IOMapEditor
