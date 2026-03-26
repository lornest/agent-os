import { parseArgs } from 'node:util';
import { render } from 'ink';
import { App } from './app.js';

const DEFAULT_URL = 'ws://localhost:18789/ws';

const { values } = parseArgs({
  options: {
    url: {
      type: 'string',
      short: 'u',
      default: DEFAULT_URL,
    },
    token: {
      type: 'string',
      short: 't',
    },
    agent: {
      type: 'string',
      short: 'a',
      default: 'assistant',
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
  },
  strict: true,
});

if (values.help) {
  console.log(`
clothos-tui — Terminal chat interface for ClothOS agents

Usage:
  clothos-tui [options]

Options:
  -a, --agent <id>   Target agent ID (default: assistant)
  -u, --url <url>    Gateway WebSocket URL (default: ${DEFAULT_URL})
  -t, --token <tok>  Auth token (only needed if gateway requires auth)
  -h, --help         Show this help message
`);
  process.exit(0);
}

render(
  <App
    url={values.url!}
    token={values.token}
    agentId={values.agent!}
  />,
);
