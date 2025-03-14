import { SpurType, WorkflowCreateRequest, WorkflowResponse } from '@/types/api_types/workflowSchemas'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import Header from '../../components/Header'
import LoadingSpinner from '../../components/LoadingSpinner'
import { setTestInputs } from '../../store/flowSlice'
import { fetchNodeTypes } from '../../store/nodeTypesSlice'
import { AppDispatch, persistor } from '../../store/store'
import { getWorkflow } from '../../utils/api'

// Use dynamic import for Canvas components to avoid SSR issues
const EditorCanvas = dynamic(() => import('../../components/canvas/EditorCanvas'), {
    ssr: false,
})

const ChatCanvas = dynamic(() => import('../../components/canvas/ChatCanvas'), {
    ssr: false,
})

const WorkflowPage: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>()
    const router = useRouter()
    const { id } = router.query
    const [workflowData, setWorkflowData] = useState<WorkflowResponse | null>(null)
    const [handleDownloadImage, setHandleDownloadImage] = useState<(() => void) | undefined>()

    useEffect(() => {
        dispatch(fetchNodeTypes())
        const fetchWorkflow = async () => {
            try {
                if (typeof id !== 'string') return
                const data = await getWorkflow(id)
                setWorkflowData(data)

                if (data.definition?.test_inputs) {
                    dispatch(setTestInputs(data.definition.test_inputs))
                }
            } catch (error) {
                console.error('Error fetching workflow:', error)
            }
        }

        if (id) {
            fetchWorkflow()
        }
    }, [id, dispatch])

    if (!workflowData) {
        return <LoadingSpinner />
    }

    // Determine which canvas to show based on spur type
    const isChatbot = workflowData.definition.spur_type === SpurType.CHATBOT

    return (
        <PersistGate loading={null} persistor={persistor}>
            <div className="h-screen flex flex-col overflow-hidden">
                <Header activePage="workflow" handleDownloadImage={handleDownloadImage} />
                <div className="flex-grow overflow-hidden">
                    {isChatbot ? (
                        <ChatCanvas
                            workflowData={workflowData as WorkflowCreateRequest}
                            workflowID={id as string}
                            onDownloadImageInit={(handler) => setHandleDownloadImage(() => handler)}
                        />
                    ) : (
                        <EditorCanvas
                            workflowData={workflowData as WorkflowCreateRequest}
                            workflowID={id as string}
                            onDownloadImageInit={(handler) => setHandleDownloadImage(() => handler)}
                        />
                    )}
                </div>
            </div>
        </PersistGate>
    )
}

export default WorkflowPage
