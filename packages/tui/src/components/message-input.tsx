import { useState } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface MessageInputProps {
  onSubmit: (value: string) => void;
  isLoading: boolean;
}

export function MessageInput({ onSubmit, isLoading }: MessageInputProps) {
  // Key-based remounting to clear the uncontrolled TextInput after submit
  const [inputKey, setInputKey] = useState(0);

  const handleSubmit = (text: string) => {
    if (text.trim()) {
      onSubmit(text);
      setInputKey(k => k + 1);
    }
  };

  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      <Text color="green" bold>&gt; </Text>
      {isLoading ? (
        <Text dimColor>Agent is thinking...</Text>
      ) : (
        <TextInput
          key={inputKey}
          onSubmit={handleSubmit}
          placeholder="Type a message... (Enter to send)"
        />
      )}
    </Box>
  );
}
