import { Chip } from '@heroui/react'
import { Icon } from '@iconify/react'
import React from 'react'

import { SpurType } from '@/types/api_types/workflowSchemas'

interface SpurTypeChipProps {
    spurType: SpurType
    showText?: boolean
}

const SpurTypeChip: React.FC<SpurTypeChipProps> = ({ spurType, showText = true }) => {
    // Determine the text and icon based on spur type
    let text = 'Unknown';
    let icon = 'lucide:help-circle';

    switch(spurType) {
        case SpurType.CHATBOT:
            text = 'Chatbot';
            icon = 'lucide:message-square';
            break;
        case SpurType.WORKFLOW:
            text = 'Workflow';
            icon = 'lucide:workflow';
            break;
        case SpurType.AGENT:
            text = 'Agent';
            icon = 'lucide:bot';
            break;
        default:
            // For debugging unknown values
            console.warn('Unknown SpurType value:', spurType);
            text = typeof spurType === 'string' ? spurType : 'Unknown';
    }

    return (
        <Chip
            size="sm"
            variant="flat"
            title={!showText ? text : undefined}
            startContent={<Icon icon={icon} width={16} />}
        >
            {showText && text}
        </Chip>
    )
}

export default SpurTypeChip
