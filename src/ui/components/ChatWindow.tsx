import React from 'react';
import { ChatMessage, PageContext } from '../../shared/types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { PageContextStatus } from './PageContextStatus';

interface Props {
    messages: ChatMessage[];
    pageContext?: PageContext;
    onSendMessage: (text: string, image?: string) => void;
    isLoading?: boolean;
    onAbort?: () => void;
    onRegenerate?: () => void;
    onEditLastMessage?: (newContent: string) => void;
    contextEnabled?: boolean;
    onToggleContext?: () => void;
}

export const ChatWindow: React.FC<Props> = ({
    messages, pageContext, onSendMessage, isLoading,
    onAbort, onRegenerate, onEditLastMessage,
    contextEnabled, onToggleContext
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            <PageContextStatus pageContext={pageContext} />

            <MessageList
                messages={messages}
                isLoading={isLoading}
                onRegenerate={onRegenerate}
                onEditLastMessage={onEditLastMessage}
            />

            <MessageInput
                onSend={onSendMessage}
                disabled={isLoading}
                isLoading={isLoading}
                onAbort={onAbort}
                contextEnabled={contextEnabled}
                onToggleContext={onToggleContext}
            />
        </div>
    );
};
