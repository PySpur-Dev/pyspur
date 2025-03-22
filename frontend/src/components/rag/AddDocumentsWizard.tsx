import { Alert, Button, Card, CardBody, Chip, Divider, Progress, Spinner, Tooltip } from '@heroui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Info } from 'lucide-react'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import {
    KnowledgeBaseCreationJob,
    addDocumentsToKnowledgeBase,
    getKnowledgeBase,
    getKnowledgeBaseJobStatus,
} from '@/utils/api'

import FileUploadBox from '../FileUploadBox'

const AddDocumentsWizard: React.FC<{ knowledgeBaseId: string }> = ({ knowledgeBaseId }) => {
    const router = useRouter()
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
    const [knowledgeBase, setKnowledgeBase] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [jobStatus, setJobStatus] = useState<KnowledgeBaseCreationJob | null>(null)
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
    const [alert, setAlert] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

    useEffect(() => {
        const loadKnowledgeBase = async () => {
            try {
                const kb = await getKnowledgeBase(knowledgeBaseId)
                setKnowledgeBase(kb)
            } catch (error) {
                console.error('Error loading knowledge base:', error)
                setAlert({ type: 'danger', message: 'Error loading knowledge base' })
            } finally {
                setIsLoading(false)
            }
        }

        loadKnowledgeBase()
    }, [knowledgeBaseId])

    // Add cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval)
            }
        }
    }, [pollingInterval])

    // Clear alert after 5 seconds
    useEffect(() => {
        if (alert) {
            const timer = setTimeout(() => {
                setAlert(null)
            }, 5000)
            return () => clearTimeout(timer)
        }
    }, [alert])

    const startPollingJobStatus = (jobId: string) => {
        // Clear any existing interval
        if (pollingInterval) {
            clearInterval(pollingInterval)
        }

        // Start polling every 2 seconds
        const interval = setInterval(async () => {
            try {
                const status = await getKnowledgeBaseJobStatus(jobId)
                setJobStatus(status)

                // Stop polling if the job is completed or failed
                if (status.status === 'completed' || status.status === 'failed') {
                    clearInterval(interval)
                    setPollingInterval(null)

                    // Redirect to RAG page if completed
                    if (status.status === 'completed') {
                        router.push('/rag')
                    }
                }
            } catch (error) {
                console.error('Error polling job status:', error)
                clearInterval(interval)
                setPollingInterval(null)
            }
        }, 2000)

        setPollingInterval(interval)
    }

    const handleFilesChange = (newFiles: File[]) => {
        setUploadedFiles(newFiles)
    }

    const handleSubmit = async () => {
        if (uploadedFiles.length === 0) {
            setAlert({ type: 'danger', message: 'Please select at least one file to upload' })
            return
        }

        try {
            setIsSubmitting(true)

            // Add documents to knowledge base
            const response = await addDocumentsToKnowledgeBase(knowledgeBaseId, uploadedFiles)

            // Set initial job status immediately
            setJobStatus({
                id: response.id,
                status: 'processing',
                progress: 0,
                current_step: 'Initializing...',
                total_files: uploadedFiles.length,
                processed_files: 0,
                total_chunks: 0,
                processed_chunks: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })

            startPollingJobStatus(response.id)
        } catch (error) {
            console.error('Error adding documents:', error)
            setAlert({ type: 'danger', message: 'Error uploading documents' })
            setIsSubmitting(false)
        }
    }

    const handleCancel = () => {
        if (window.confirm('Are you sure you want to cancel? All progress will be lost.')) {
            router.push('/rag')
        }
    }

    const renderProcessingStatus = () => {
        if (!jobStatus) return null

        return (
            <div className="space-y-6 mt-4">
                <Alert
                    color={jobStatus.status === 'failed' ? 'danger' : 'primary'}
                    title={jobStatus.current_step || 'Processing documents...'}
                >
                    {jobStatus.status === 'failed'
                        ? (jobStatus.error_message || 'An error occurred during processing')
                        : 'Your documents are being processed. This may take a few minutes.'}
                </Alert>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{jobStatus.current_step}</span>
                        <span className="text-sm text-default-400">{Math.round(jobStatus.progress * 100)}%</span>
                    </div>
                    <Progress
                        value={jobStatus.progress * 100}
                        color={jobStatus.status === 'failed' ? 'danger' : 'primary'}
                        className="w-full"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {jobStatus.total_files > 0 && (
                        <div className="flex items-center justify-between text-sm p-3 bg-default-50 rounded-lg">
                            <span>Files Processed</span>
                            <Chip color="primary" variant="flat">
                                {jobStatus.processed_files} / {jobStatus.total_files}
                            </Chip>
                        </div>
                    )}

                    {jobStatus.total_chunks > 0 && (
                        <div className="flex items-center justify-between text-sm p-3 bg-default-50 rounded-lg">
                            <span>Chunks Processed</span>
                            <Chip color="primary" variant="flat">
                                {jobStatus.processed_chunks} / {jobStatus.total_chunks}
                            </Chip>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 text-sm text-default-400">
                    <Spinner size="sm" />
                    <span>
                        {jobStatus.status === 'failed'
                            ? 'Processing failed'
                            : jobStatus.status === 'completed'
                                ? 'Processing complete'
                                : 'Processing your documents...'}
                    </span>
                </div>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-[50vh]">
                <Spinner size="lg" />
            </div>
        )
    }

    if (!knowledgeBase) {
        return (
            <div className="flex justify-center items-center h-[50vh]">
                <Alert color="danger">Knowledge base not found</Alert>
            </div>
        )
    }

    return (
        <div className="max-w-[900px] mx-auto p-6">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-default-900">Add Documents</h1>
                        <p className="text-sm text-default-500">Upload files to your knowledge base</p>
                    </div>
                </div>

                <AnimatePresence>
                    {alert && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Alert
                                className="mb-4"
                                color={alert.type}
                                startContent={
                                    alert.type === 'success' ? (
                                        <CheckCircle className="h-4 w-4" />
                                    ) : (
                                        <Info className="h-4 w-4" />
                                    )
                                }
                            >
                                {alert.message}
                            </Alert>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Card className="mb-6 border border-default-200">
                    <CardBody className="gap-6">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-bold text-default-900">{knowledgeBase.name}</h2>
                                    <Chip size="sm" variant="flat" color="primary">
                                        {knowledgeBase.document_count} documents
                                    </Chip>
                                </div>
                                <p className="text-small text-default-500">
                                    {knowledgeBase.description || 'Upload documents to add to this knowledge base'}
                                </p>
                            </div>
                        </div>

                        <Divider className="my-2" />

                        {jobStatus ? (
                            renderProcessingStatus()
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">Upload Documents</span>
                                        <Tooltip content="Select documents to add to your knowledge base">
                                            <Info className="w-4 h-4 text-default-400" />
                                        </Tooltip>
                                    </div>
                                </div>

                                <FileUploadBox onFilesChange={handleFilesChange} />
                            </div>
                        )}
                    </CardBody>
                </Card>

                <div className="flex justify-between items-center">
                    <Button
                        color="danger"
                        variant="light"
                        onPress={handleCancel}
                        className="font-medium hover:bg-danger/10"
                    >
                        Cancel
                    </Button>

                    {!jobStatus && (
                        <Button
                            color="primary"
                            onPress={handleSubmit}
                            isLoading={isSubmitting}
                            isDisabled={uploadedFiles.length === 0 || isSubmitting}
                            className="font-medium"
                        >
                            Upload Documents
                        </Button>
                    )}
                </div>
            </motion.div>
        </div>
    )
}

export default AddDocumentsWizard
