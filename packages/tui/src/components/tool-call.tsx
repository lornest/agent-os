import { Box, Text } from 'ink';
import type { ToolCallDisplay } from '../types.js';
import { truncate } from '../lib/format.js';

interface ToolCallProps {
  toolCall: ToolCallDisplay;
}

export function ToolCallView({ toolCall }: ToolCallProps) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text dimColor>
        [tool:{toolCall.name}] {truncate(toolCall.arguments, 80)}
      </Text>
      {toolCall.result != null && (
        <Text dimColor>
          {'\u2192'} {truncate(toolCall.result, 120)}
        </Text>
      )}
    </Box>
  );
}
