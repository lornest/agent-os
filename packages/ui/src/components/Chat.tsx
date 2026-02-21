import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  AttachmentPrimitive,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { 
  Plus, 
  ArrowUp, 
  Square, 
  FileText, 
  X, 
  Sparkles, 
  Terminal, 
  Command,
  Layout,
  MessageSquare,
  History,
  Info
} from 'lucide-react';
import { ToolFallback } from './ToolFallback.js';

const welcomeSuggestions = [
  {
    title: 'Plan a launch',
    subtitle: 'Create a step-by-step rollout plan.',
    prompt: 'Create a detailed rollout plan for a new feature launch.',
    icon: <Layout className="w-4 h-4" />,
  },
  {
    title: 'Summarize a doc',
    subtitle: 'Turn notes into a crisp summary.',
    prompt: 'Summarize this meeting transcript into key decisions.',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    title: 'Debug a bug',
    subtitle: 'Find the root cause and fix.',
    prompt: 'Help me debug this issue and propose a fix.',
    icon: <Terminal className="w-4 h-4" />,
  },
  {
    title: 'Draft a response',
    subtitle: 'Write a customer-facing message.',
    prompt: 'Draft a friendly response to a customer escalation.',
    icon: <MessageSquare className="w-4 h-4" />,
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
    <AttachmentPrimitive.Root className="aui-attachment-root aui-attachment-root-composer chat-attachment-pill">
      <div className="chat-attachment-content">
        <FileText className="w-3.5 h-3.5" />
        <AttachmentPrimitive.Name className="chat-attachment-name" />
      </div>
      <AttachmentPrimitive.Remove className="chat-attachment-remove">
        <X className="w-3.5 h-3.5" />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="aui-composer-root chat-composer">
      <div className="chat-composer-container">
        <ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachment }} />
        <div className="chat-composer-main">
          <ComposerPrimitive.AddAttachment
            className="chat-composer-add"
            multiple
          >
            <Plus className="w-5 h-5" />
          </ComposerPrimitive.AddAttachment>
          <ComposerPrimitive.Input
            autoFocus
            placeholder="Ask Agent OS anything..."
            className="chat-composer-input"
          />
          <div className="chat-composer-actions">
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel className="chat-composer-cancel">
                <Square className="w-4 h-4 fill-current" />
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send className="chat-composer-send">
                <ArrowUp className="w-5 h-5" />
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

export function Chat() {
  return (
    <ThreadPrimitive.Root
      className="aui-thread-root chat-root dark"
      style={{ '--thread-max-width': '58rem' } as React.CSSProperties}
    >
      <div className="chat-shell">
        <header className="chat-header">
          <div className="chat-header-info">
            <div className="chat-header-brand">
              <div className="chat-logo">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="chat-header-title">Agent OS</div>
                <div className="chat-header-subtitle">Intelligence Layer</div>
              </div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className="chat-header-icon-btn">
              <History className="w-4 h-4" />
            </button>
            <button className="chat-header-icon-btn">
              <Info className="w-4 h-4" />
            </button>
            <div className="chat-header-status">
              <ThreadPrimitive.If running>
                <span className="chat-header-status-dot is-running" />
                <span className="chat-header-status-text">Processing</span>
              </ThreadPrimitive.If>
              <ThreadPrimitive.If running={false}>
                <span className="chat-header-status-dot" />
                <span className="chat-header-status-text">Ready</span>
              </ThreadPrimitive.If>
            </div>
          </div>
        </header>

        <ThreadPrimitive.Viewport className="chat-viewport">
          <ThreadPrimitive.Empty>
            <div className="chat-welcome">
              <div className="chat-welcome-content">
                <div className="chat-welcome-badge">
                  <Sparkles className="w-3 h-3" />
                  <span>Next Generation AI</span>
                </div>
                <h1 className="chat-welcome-title">
                  Experience the power of <span className="text-gradient">Agentic Workflows</span>
                </h1>
                <p className="chat-welcome-subtitle">
                  Secure, intelligent, and context-aware assistance for your entire workspace.
                </p>
              </div>

              <div className="chat-welcome-grid">
                {welcomeSuggestions.map((suggestion) => (
                  <ThreadPrimitive.Suggestion
                    key={suggestion.title}
                    prompt={suggestion.prompt}
                    send
                    className="chat-welcome-card"
                  >
                    <div className="chat-welcome-card-icon">
                      {suggestion.icon}
                    </div>
                    <div className="chat-welcome-card-content">
                      <div className="chat-welcome-card-title">{suggestion.title}</div>
                      <div className="chat-welcome-card-subtitle">{suggestion.subtitle}</div>
                    </div>
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </ThreadPrimitive.Empty>

          <div className="chat-messages-container">
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
              }}
            />
          </div>
          
          <ThreadPrimitive.ScrollToBottom className="chat-scroll-button">
            <ArrowUp className="w-4 h-4 rotate-180" />
            <span>Latest Messages</span>
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>

        <div className="chat-footer">
          <ThreadPrimitive.If empty={false}>
            <div className="chat-followups">
              {followupSuggestions.map((suggestion) => (
                <ThreadPrimitive.Suggestion
                  key={suggestion.label}
                  prompt={suggestion.prompt}
                  send
                  className="chat-followup-pill"
                >
                  <Command className="w-3 h-3 mr-1.5 opacity-60" />
                  {suggestion.label}
                </ThreadPrimitive.Suggestion>
              ))}
            </div>
          </ThreadPrimitive.If>
          <Composer />
          <div className="chat-footer-meta">
            <div className="chat-footer-hint">
              <span className="kbd">Shift</span> + <span className="kbd">Enter</span> for new line
            </div>
            <div className="chat-footer-branding">
              Powered by Agent OS Core
            </div>
          </div>
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}

