import { Button, Card, Spinner } from '@heroui/react'
import { Icon } from '@iconify/react'
import React from 'react'

interface NodeControlsProps {
    id: string
    isRunning: boolean
    loading: boolean
    isInputNode: boolean
    hasRun: boolean
    handlePartialRun: () => void
    handleDelete?: () => void
    handleDuplicate?: () => void
    handleOpenModal?: (isModalOpen: boolean) => void
    handleDetach?: () => void
}

const controlsCardStyle = {
    position: 'absolute' as const,
    top: '-45px',
    right: '0px',
    padding: '8px',
    backdropFilter: 'blur(8px)',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--default-200)',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    pointerEvents: 'auto' as const,
}

const NodeControls: React.FC<NodeControlsProps> = ({
    id,
    isRunning,
    loading,
    hasRun,
    handlePartialRun,
    handleDelete,
    handleDuplicate,
    handleOpenModal,
    handleDetach,
}) => {
    return (
        <Card
            key={`controls-card-${id}`}
            style={controlsCardStyle}
            className={`opacity-0 group-hover:opacity-100 dark:bg-default-100/20 dark:border-default-700 shadow-lg dark:shadow-lg-dark`}
            classNames={{
                base: 'bg-background/80 border-default-200 transition-all duration-200',
            }}
        >
            <div className="flex flex-row gap-2">
                <Button
                    key={`run-btn-${id}`}
                    isIconOnly
                    radius="lg"
                    variant="light"
                    onPress={handlePartialRun}
                    disabled={loading || isRunning}
                    className="hover:bg-primary/20"
                >
                    {isRunning ? (
                        <Spinner key={`spinner-${id}`} size="sm" color="current" />
                    ) : (
                        <Icon
                            key={`play-icon-${id}`}
                            className="text-default-600 dark:text-default-400"
                            icon="solar:play-linear"
                            width={22}
                        />
                    )}
                </Button>
                {handleDuplicate && (
                    <Button
                        key={`duplicate-btn-${id}`}
                        isIconOnly
                        radius="lg"
                        variant="light"
                        onPress={handleDuplicate}
                    >
                        <Icon
                            key={`duplicate-icon-${id}`}
                            className="text-default-600 dark:text-default-400"
                            icon="solar:copy-linear"
                            width={22}
                        />
                    </Button>
                )}
                {handleDetach && (
                    <Button key={`detach-btn-${id}`} isIconOnly radius="lg" variant="light" onPress={handleDetach}>
                        <Icon
                            key={`detach-icon-${id}`}
                            className="text-default-600 dark:text-default-400"
                            icon="solar:link-broken-linear"
                            width={22}
                        />
                    </Button>
                )}
                {handleOpenModal && hasRun && (
                    <Button
                        key={`modal-btn-${id}`}
                        isIconOnly
                        radius="lg"
                        variant="light"
                        onPress={() => handleOpenModal(true)}
                    >
                        <Icon
                            key={`view-icon-${id}`}
                            className="text-default-600 dark:text-default-400"
                            icon="solar:eye-linear"
                            width={22}
                        />
                    </Button>
                )}
                {handleDelete && (
                    <Button key={`delete-btn-${id}`} isIconOnly radius="lg" variant="light" onPress={handleDelete}>
                        <Icon
                            key={`delete-icon-${id}`}
                            className="text-default-600 dark:text-default-400"
                            icon="solar:trash-bin-trash-linear"
                            width={22}
                        />
                    </Button>
                )}
            </div>
        </Card>
    )
}

export default NodeControls
