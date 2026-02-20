import { ThreadPrimitive, ComposerPrimitive, MessagePrimitive } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { ToolFallback } from './ToolFallback.js';

function UserMessage() {
  return (
    <MessagePrimitive.Root className="aui-user-message">
      <div className="aui-user-message-content">
        <MessagePrimitive.Parts components={{ Text: TextPart }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-assistant-message">
      <div className="aui-assistant-message-content">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { Fallback: ToolFallback },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function TextPart() {
  return (
    <p className="aui-text">
      <MessagePrimitive.Content />
    </p>
  );
}

function MarkdownText() {
  return <MarkdownTextPrimitive />;
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="aui-composer-root">
      <ComposerPrimitive.Input
        autoFocus
        placeholder="Type a message..."
        className="aui-composer-input"
      />
      <ComposerPrimitive.Send className="aui-composer-send" />
    </ComposerPrimitive.Root>
  );
}

export function Chat() {
  return (
    <div className="h-dvh">
      <ThreadPrimitive.Root className="aui-root aui-thread-root">
        <ThreadPrimitive.Viewport className="aui-thread-viewport">
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </ThreadPrimitive.Viewport>
        <Composer />
      </ThreadPrimitive.Root>
    </div>
  );
}
