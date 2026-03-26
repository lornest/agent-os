import { Box, Text } from 'ink';
import type { ChatMessage } from '../types.js';
import { roleLabel } from '../lib/format.js';
import { ToolCallView } from './tool-call.js';

interface MessageListProps {
  messages: ChatMessage[];
}

const ROLE_COLOR: Record<string, string> = {
  user: 'green',
  assistant: 'blue',
  tool: 'gray',
  system: 'yellow',
};

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
      {messages.map(msg => (
        <Box key={msg.id} flexDirection="column" marginBottom={0}>
          <Text>
            <Text color={ROLE_COLOR[msg.role] ?? 'white'} bold>
              {roleLabel(msg.role)}&gt;
            </Text>
            {' '}
            <Text>{msg.content}</Text>
          </Text>
          {msg.toolCalls?.map((tc, i) => (
            <ToolCallView key={i} toolCall={tc} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
