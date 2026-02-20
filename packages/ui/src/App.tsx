import { GatewayRuntimeProvider } from './lib/runtime-provider.js';
import { Chat } from './components/Chat.js';

export function App() {
  return (
    <GatewayRuntimeProvider>
      <Chat />
    </GatewayRuntimeProvider>
  );
}
