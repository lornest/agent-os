import { useState, useEffect, useRef, useCallback } from 'react';
import { GatewayClient } from '@clothos/gateway';
import type { GatewayClientOptions } from '@clothos/gateway';
import type { AgentMessage } from '@clothos/core';
import type { ConnectionStatus } from '../types.js';

export interface UseGatewayOptions {
  url: string;
  token?: string;
}

export interface UseGatewayResult {
  status: ConnectionStatus;
  send: (msg: AgentMessage) => void;
  onResponse: (correlationId: string, handler: (msg: AgentMessage) => void) => void;
  removeResponseHandler: (correlationId: string) => void;
}

export function useGateway({ url, token }: UseGatewayOptions): UseGatewayResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const clientRef = useRef<GatewayClient | null>(null);

  useEffect(() => {
    const options: GatewayClientOptions = {
      url,
      authToken: token,
      reconnect: true,
    };

    const client = new GatewayClient(options);
    clientRef.current = client;
    setStatus('connecting');

    client.connect()
      .then(() => setStatus('connected'))
      .catch(() => setStatus('error'));

    return () => {
      client.disconnect().catch(() => {});
      clientRef.current = null;
    };
  }, [url, token]);

  const send = useCallback((msg: AgentMessage) => {
    clientRef.current?.send(msg).catch(() => {
      setStatus('error');
    });
  }, []);

  const onResponse = useCallback((correlationId: string, handler: (msg: AgentMessage) => void) => {
    clientRef.current?.onResponse(correlationId, handler);
  }, []);

  const removeResponseHandler = useCallback((correlationId: string) => {
    clientRef.current?.removeResponseHandler(correlationId);
  }, []);

  return { status, send, onResponse, removeResponseHandler };
}
