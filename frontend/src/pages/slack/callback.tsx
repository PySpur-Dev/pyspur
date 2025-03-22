import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Card, CardBody, Spinner } from '@heroui/react'
import { Icon } from '@iconify/react'
import Head from 'next/head'
import { handleSlackCallback } from '@/utils/api'

const SlackCallbackPage: React.FC = () => {
    const router = useRouter()
    const { code, error } = router.query
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
    const [message, setMessage] = useState<string>('Processing Slack authentication...')
    const [teamName, setTeamName] = useState<string | null>(null)

    useEffect(() => {
        if (!router.isReady) return

        if (error) {
            setStatus('error')
            setMessage(`Authentication failed: ${error}`)
            return
        }

        if (code) {
            const exchangeCodeForToken = async () => {
                try {
                    // Exchange the code for a token
                    const response = await handleSlackCallback(code as string)

                    if (response && response.success) {
                        setStatus('success')
                        setMessage('Authentication successful!')
                        setTeamName(response.team_name || null)

                        // Redirect after a short delay
                        setTimeout(() => {
                            window.opener?.postMessage({ type: 'slack-auth-success' }, '*')
                            // Close this window if it was opened as a popup
                            if (window.opener) {
                                window.close()
                            } else {
                                router.push('/')
                            }
                        }, 2000)
                    } else {
                        setStatus('error')
                        setMessage('Failed to authenticate with Slack')
                    }
                } catch (err: any) {
                    console.error('Error authenticating with Slack:', err)
                    setStatus('error')
                    setMessage(err.response?.data?.detail || 'Failed to authenticate with Slack')
                }
            }

            exchangeCodeForToken()
        }
    }, [router.isReady, code, error, router])

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4">
            <Head>
                <title>Slack Authentication | PySpur</title>
            </Head>

            <Card className="w-full max-w-md">
                <CardBody className="flex flex-col items-center gap-4 p-8">
                    <Icon
                        icon="logos:slack-icon"
                        width={48}
                        height={48}
                    />

                    <h1 className="text-xl font-bold text-center">Slack Authentication</h1>

                    {status === 'processing' && (
                        <div className="flex flex-col items-center gap-3">
                            <Spinner size="lg" />
                            <p className="text-center">{message}</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="flex flex-col items-center gap-3">
                            <div className="rounded-full bg-success/20 p-3">
                                <Icon icon="solar:check-circle-bold" className="text-success" width={32} />
                            </div>
                            <p className="text-center font-medium">{message}</p>
                            {teamName && (
                                <p className="text-center text-default-600">
                                    Connected to workspace: <span className="font-semibold">{teamName}</span>
                                </p>
                            )}
                            <p className="text-center text-small text-default-500">
                                {window.opener ? 'This window will close automatically.' : 'Redirecting you back...'}
                            </p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-3">
                            <div className="rounded-full bg-danger/20 p-3">
                                <Icon icon="solar:close-circle-bold" className="text-danger" width={32} />
                            </div>
                            <p className="text-center font-medium text-danger">{message}</p>
                            <button
                                className="mt-2 text-primary underline"
                                onClick={() => router.push('/')}
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    )}
                </CardBody>
            </Card>
        </div>
    )
}

export default SlackCallbackPage