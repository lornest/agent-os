import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  AttachmentPrimitive,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { ToolFallback } from './ToolFallback.js';

const welcomeSuggestions = [
  {
    title: 'Plan a launch',
    subtitle: 'Create a step-by-step rollout plan for a new feature.',
    prompt: 'Create a detailed rollout plan for a new feature launch.',
  },
  {
    title: 'Summarize a doc',
    subtitle: 'Turn notes into a crisp executive summary.',
    prompt: 'Summarize this meeting transcript into key decisions and next steps.',
  },
  {
    title: 'Debug a bug',
    subtitle: 'Find the root cause and propose a fix.',
    prompt: 'Help me debug this issue and propose a fix with a test plan.',
  },
  {
    title: 'Draft a response',
    subtitle: 'Write a clear customer-facing message.',
    prompt: 'Draft a friendly but direct response to a customer escalation.',
  },
];

const followupSuggestions = [
  {
    label: 'Outline next steps',
    prompt: 'Outline the next steps with owners and timelines.',
  },
  {
    label: 'Generate test cases',
    prompt: 'Generate test cases for the proposed changes.',
  },
  {
    label: 'Write a PR description',
    prompt: 'Write a clear PR description for these changes.',
  },
];

function UserMessage() {
  return (
    <MessagePrimitive.Root className="aui-user-message-root chat-user-message">
      <div className="aui-user-message-content chat-user-bubble">
        <MessagePrimitive.Parts components={{ Text: TextPart }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-assistant-message-root chat-assistant-message">
      <div className="aui-assistant-message-content chat-assistant-bubble">
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
    <p className="aui-text chat-text">
      <MessagePrimitive.Content />
    </p>
  );
}

function MarkdownText() {
  return (
    <div className="chat-markdown">
      <MarkdownTextPrimitive />
    </div>
  );
}

function ComposerAttachment() {
  return (
    <AttachmentPrimitive.Root className="aui-attachment-root aui-attachment-root-composer">
      <div id="attachment-tile" className="aui-attachment-tile aui-attachment-tile-composer">
        <div className="chat-attachment-icon">FILE</div>
        <AttachmentPrimitive.Name className="chat-attachment-name" />
      </div>
      <AttachmentPrimitive.Remove className="aui-attachment-tile-remove">
        <span className="chat-attachment-remove">×</span>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="aui-composer-root chat-composer">
      <ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachment }} />
      <div className="chat-composer-main">
        <ComposerPrimitive.AddAttachment
          className="aui-composer-add-attachment chat-composer-add"
          multiple
        >
          Attach
        </ComposerPrimitive.AddAttachment>
        <ComposerPrimitive.Input
          autoFocus
          placeholder="Ask Agent OS anything..."
          className="aui-composer-input chat-composer-input"
        />
        <div className="chat-composer-actions">
          <ThreadPrimitive.If running>
            <ComposerPrimitive.Cancel className="aui-composer-cancel chat-composer-cancel">
              Stop
            </ComposerPrimitive.Cancel>
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running={false}>
            <ComposerPrimitive.Send className="aui-composer-send chat-composer-send">
              Send
            </ComposerPrimitive.Send>
          </ThreadPrimitive.If>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

export function Chat() {
  return (
    <ThreadPrimitive.Root
      className="aui-thread-root chat-root dark"
      style={{ '--thread-max-width': '54rem' } as React.CSSProperties}
    >
      <div className="chat-shell">
        <header className="chat-header">
          <div>
            <div className="chat-header-title">Agent OS</div>
            <div className="chat-header-subtitle">LLM Workspace</div>
          </div>
          <div className="chat-header-status">
            <ThreadPrimitive.If running>
              <span className="chat-header-status-dot is-running" />
              Running
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running={false}>
              <span className="chat-header-status-dot" />
              Ready
            </ThreadPrimitive.If>
          </div>
        </header>
        <ThreadPrimitive.Viewport className="aui-thread-viewport chat-viewport">
          <ThreadPrimitive.Empty>
            <div className="aui-thread-welcome-root chat-welcome">
              <div className="chat-welcome-kicker">Welcome</div>
              <div className="chat-welcome-title">What do you want to build today?</div>
              <div className="chat-welcome-subtitle">
                Start with a prompt or pick a quick action to get moving.
              </div>
              <div className="aui-thread-welcome-suggestions chat-welcome-grid">
                {welcomeSuggestions.map((suggestion) => (
                  <div key={suggestion.title} className="aui-thread-welcome-suggestion-display">
                    <ThreadPrimitive.Suggestion
                      prompt={suggestion.prompt}
                      send
                      className="aui-thread-welcome-suggestion chat-welcome-card"
                    >
                      <span className="aui-thread-welcome-suggestion-text-1">
                        {suggestion.title}
                      </span>
                      <span className="aui-thread-welcome-suggestion-text-2">
                        {suggestion.subtitle}
                      </span>
                    </ThreadPrimitive.Suggestion>
                  </div>
                ))}
              </div>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
          <ThreadPrimitive.ScrollToBottom className="aui-thread-scroll-to-bottom chat-scroll-button">
            Jump to latest
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>
        <ThreadPrimitive.If empty={false}>
          <div className="aui-thread-followup-suggestions chat-followups">
            {followupSuggestions.map((suggestion) => (
              <ThreadPrimitive.Suggestion
                key={suggestion.label}
                prompt={suggestion.prompt}
                send
                className="aui-thread-followup-suggestion chat-followup-pill"
              >
                {suggestion.label}
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
        </ThreadPrimitive.If>
        <div className="aui-thread-viewport-footer chat-footer">
          <Composer />
          <div className="chat-footer-hint">
            Shift + Enter for a new line • Attach files or paste screenshots
          </div>
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}
