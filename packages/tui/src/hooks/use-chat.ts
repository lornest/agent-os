import { useState, useCallback, useRef } from 'react';
import type { AgentMessage } from '@clothos/core';
import { generateId } from '@clothos/core';
import { createTaskRequest } from '../lib/message-factory.js';
import type { ChatMessage } from '../types.js';
import type { UseGatewayResult } from './use-gateway.js';

export interface UseChatOptions {
  agentId: string;
  gateway: UseGatewayResult;
  onQuit: () => void;
}

export interface UseChatResult {
  messages: ChatMessage[];
  isLoading: boolean;
  send: (input: string) => void;
}

export function useChat({ agentId, gateway, onQuit }: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const sessionIdRef = useRef<string | undefined>(undefined);

  const send = useCallback((input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Handle slash commands
    if (trimmed === '/quit') {
      onQuit();
      return;
    }

    if (trimmed === '/clear') {
      setMessages([]);
      sessionIdRef.current = undefined;
      return;
    }

    // Append user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Build and send task.request
    const request = createTaskRequest(agentId, trimmed, sessionIdRef.current);
    const correlationId = request.correlationId!;

    // Register response handler for this correlation
    gateway.onResponse(correlationId, (response: AgentMessage) => {
      const data = response.data as Record<string, unknown> | undefined;

      // Track session ID from agent responses
      if (data?.sessionId && typeof data.sessionId === 'string') {
        sessionIdRef.current = data.sessionId;
      }

      // Terminal message types signal completion
      if (response.type === 'task.done' || response.type === 'task.error') {
        gateway.removeResponseHandler(correlationId);
        setIsLoading(false);

        if (response.type === 'task.error') {
          const errorText = typeof data?.error === 'string'
            ? data.error
            : 'Agent encountered an error';
          setMessages(prev => [...prev, {
            id: generateId(),
            role: 'system',
            content: errorText,
          }]);
        }
        return;
      }

      // Agent response with text content
      if (response.type === 'task.response') {
        const text = typeof data?.text === 'string' ? data.text : JSON.stringify(data);
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          content: text,
        }]);
      }
    });

    gateway.send(request);
  }, [agentId, gateway, onQuit]);

  return { messages, isLoading, send };
}
