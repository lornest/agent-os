import { Box, Text } from 'ink';
import type { ConnectionStatus } from '../types.js';

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  agentId: string;
}

const STATUS_INDICATOR: Record<ConnectionStatus, { dot: string; color: string }> = {
  connected:    { dot: '\u25cf', color: 'green' },
  connecting:   { dot: '\u25cf', color: 'yellow' },
  disconnected: { dot: '\u25cf', color: 'red' },
  error:        { dot: '\u25cf', color: 'red' },
};

export function StatusBar({ connectionStatus, agentId }: StatusBarProps) {
  const { dot, color } = STATUS_INDICATOR[connectionStatus];

  return (
    <Box borderStyle="single" borderBottom={false} paddingX={1} justifyContent="space-between">
      <Text>
        <Text color={color}>{dot}</Text>
        {' '}
        <Text bold>{connectionStatus}</Text>
      </Text>
      <Text dimColor>agent: {agentId}</Text>
    </Box>
  );
}
