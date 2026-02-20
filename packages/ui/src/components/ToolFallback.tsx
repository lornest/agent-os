import type { ToolCallMessagePartProps } from '@assistant-ui/react';

export function ToolFallback({
  toolName,
  args,
  result,
}: ToolCallMessagePartProps) {
  return (
    <details className="my-2 rounded border border-gray-200 bg-gray-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-700">
        Tool: {toolName}
      </summary>
      <pre className="mt-2 overflow-x-auto text-xs text-gray-600">
        {JSON.stringify(args, null, 2)}
      </pre>
      {result !== undefined && (
        <pre className="mt-2 overflow-x-auto border-t border-gray-200 pt-2 text-xs text-gray-600">
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </details>
  );
}
