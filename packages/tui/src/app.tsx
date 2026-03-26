import { useGateway } from './hooks/use-gateway.js';
import { useChat } from './hooks/use-chat.js';
import { ChatView } from './components/chat-view.js';
import { useApp } from 'ink';

export interface AppProps {
  url: string;
  token?: string;
  agentId: string;
}

export function App({ url, token, agentId }: AppProps) {
  const { exit } = useApp();
  const gateway = useGateway({ url, token });
  const { messages, isLoading, send } = useChat({
    agentId,
    gateway,
    onQuit: () => exit(),
  });

  return (
    <ChatView
      connectionStatus={gateway.status}
      agentId={agentId}
      messages={messages}
      isLoading={isLoading}
      onSubmit={send}
    />
  );
}
