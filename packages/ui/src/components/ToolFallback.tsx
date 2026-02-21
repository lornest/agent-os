import type { ToolCallMessagePartProps } from '@assistant-ui/react';

export function ToolFallback({
  toolName,
  args,
  result,
}: ToolCallMessagePartProps) {
  return (
    <details className="chat-tool-fallback">
      <summary className="chat-tool-fallback-summary">
        Tool call: {toolName}
      </summary>
      <pre className="chat-tool-fallback-block">
        {JSON.stringify(args, null, 2)}
      </pre>
      {result !== undefined && (
        <pre className="chat-tool-fallback-block chat-tool-fallback-result">
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </details>
  );
}
