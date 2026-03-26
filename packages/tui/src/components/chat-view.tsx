import { Box } from 'ink';
import type { ConnectionStatus, ChatMessage } from '../types.js';
import { StatusBar } from './status-bar.js';
import { MessageList } from './message-list.js';
import { MessageInput } from './message-input.js';

interface ChatViewProps {
  connectionStatus: ConnectionStatus;
  agentId: string;
  messages: ChatMessage[];
  isLoading: boolean;
  onSubmit: (input: string) => void;
}

export function ChatView({ connectionStatus, agentId, messages, isLoading, onSubmit }: ChatViewProps) {
  return (
    <Box flexDirection="column" height="100%">
      <StatusBar connectionStatus={connectionStatus} agentId={agentId} />
      <MessageList messages={messages} />
      <MessageInput onSubmit={onSubmit} isLoading={isLoading} />
    </Box>
  );
}
