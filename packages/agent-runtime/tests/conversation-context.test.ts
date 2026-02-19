import { describe, it, expect } from 'vitest';
import { ConversationContext } from '../src/conversation-context.js';

describe('ConversationContext', () => {
  it('constructor creates system prompt as first message', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'You are helpful.',
    });

    const msgs = ctx.getMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toBe('You are helpful.');
  });

  it('constructor preserves existing system prompt from messages', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'ignored',
      messages: [
        { role: 'system', content: 'Original system.' },
        { role: 'user', content: 'Hi' },
      ],
    });

    const msgs = ctx.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toBe('Original system.');
  });

  it('constructor prepends system prompt when messages lack one', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const msgs = ctx.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.role).toBe('user');
  });

  it('addUserMessage appends a user message', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'sys',
    });

    ctx.addUserMessage('Hello');
    const msgs = ctx.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[1]!.role).toBe('user');
    expect(msgs[1]!.content).toBe('Hello');
  });

  it('addAssistantMessage appends with optional tool calls', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'sys',
    });

    ctx.addAssistantMessage('Here is the result', [
      { id: 'tc1', name: 'search', arguments: '{}' },
    ]);

    const msgs = ctx.getMessages();
    expect(msgs[1]!.role).toBe('assistant');
    expect(msgs[1]!.toolCalls).toHaveLength(1);
  });

  it('addToolResult appends a tool message', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'sys',
    });

    ctx.addToolResult('tc1', '{"result": 42}');
    const msgs = ctx.getMessages();
    expect(msgs[1]!.role).toBe('tool');
    expect(msgs[1]!.toolCallId).toBe('tc1');
  });

  it('getHistory returns non-system messages', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'sys',
    });

    ctx.addUserMessage('Hello');
    ctx.addAssistantMessage('Hi');

    const history = ctx.getHistory();
    expect(history).toHaveLength(2);
    expect(history.every((m) => m.role !== 'system')).toBe(true);
  });

  it('getLastExchanges returns the last N user+assistant pairs', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'sys',
    });

    ctx.addUserMessage('Q1');
    ctx.addAssistantMessage('A1');
    ctx.addUserMessage('Q2');
    ctx.addAssistantMessage('A2');
    ctx.addUserMessage('Q3');
    ctx.addAssistantMessage('A3');

    const last2 = ctx.getLastExchanges(2);
    expect(last2).toHaveLength(4);
    expect(last2[0]!.content).toBe('Q2');
    expect(last2[1]!.content).toBe('A2');
    expect(last2[2]!.content).toBe('Q3');
    expect(last2[3]!.content).toBe('A3');
  });

  it('replaceMessages replaces all messages', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'sys',
    });

    ctx.addUserMessage('Hello');
    ctx.replaceMessages([
      { role: 'system', content: 'new sys' },
      { role: 'user', content: 'new' },
    ]);

    const msgs = ctx.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.content).toBe('new sys');
  });

  it('getSystemPrompt returns the system prompt content', () => {
    const ctx = new ConversationContext({
      agentId: 'a1',
      sessionId: 's1',
      systemPrompt: 'You are a bot.',
    });

    expect(ctx.getSystemPrompt()).toBe('You are a bot.');
  });
});
