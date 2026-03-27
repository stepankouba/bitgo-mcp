import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getWalletBalances } from './tools/balances';
import { getPendingApprovals } from './tools/approvals';
import { getTransferStatus } from './tools/transferStatus';
import { listTransfers } from './tools/listTransfers';

function createServer(): Server {
  const server = new Server(
    { name: 'bitgo-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_wallet_balances',
        description:
          'Get BTC confirmed and spendable balances for Littlebit custody wallets. ' +
          'Current wallets: LW0, LW1, LIW1, LCW1, LCEW1, LCW2, LCW3_1. ' +
          'Wallets with _V1 suffix (e.g. LW0_V1) are previous-generation wallets retained for historical lookups. ' +
          'Omit wallet to get all configured wallets.',
        inputSchema: {
          type: 'object',
          properties: {
            wallet: {
              type: 'string',
              description:
                'Logical wallet name, e.g. "LW0", "LCW1", or "LW0_V1" for previous-generation. Omit to fetch all wallets.',
            },
          },
        },
      },
      {
        name: 'get_pending_approvals',
        description:
          'List BTC transactions awaiting multi-sig or policy approval across custody wallets (current and _V1 previous-generation).',
        inputSchema: {
          type: 'object',
          properties: {
            wallet: {
              type: 'string',
              description:
                'Logical wallet name to scope the search. Omit to check all wallets.',
            },
          },
        },
      },
      {
        name: 'get_transfer_status',
        description:
          'Get the current status of a specific BTC transfer by its BitGo transfer ID or on-chain tx hash. Searches both current and _V1 previous-generation wallets.',
        inputSchema: {
          type: 'object',
          properties: {
            transferId: {
              type: 'string',
              description: 'BitGo transfer ID.',
            },
            txHash: {
              type: 'string',
              description: 'On-chain transaction hash (txid).',
            },
            wallet: {
              type: 'string',
              description:
                'Logical wallet name to narrow the search. Omit to search all wallets.',
            },
          },
        },
      },
      {
        name: 'list_transfers',
        description:
          'List recent BTC transfer history for one or all custody wallets (current and _V1 previous-generation), with optional filters.',
        inputSchema: {
          type: 'object',
          properties: {
            wallet: {
              type: 'string',
              description:
                'Logical wallet name, e.g. "LCW1". Omit to aggregate across all wallets.',
            },
            state: {
              type: 'string',
              enum: ['confirmed', 'unconfirmed', 'pendingApproval', 'signed', 'failed'],
              description: 'Filter transfers by state.',
            },
            direction: {
              type: 'string',
              enum: ['send', 'receive'],
              description: 'Filter transfers by direction.',
            },
            limit: {
              type: 'number',
              description: 'Max transfers to return per wallet (default 25, max 100).',
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (args ?? {}) as Record<string, any>;
      let result: unknown;

      switch (name) {
        case 'get_wallet_balances':
          result = await getWalletBalances(a['wallet']);
          break;
        case 'get_pending_approvals':
          result = await getPendingApprovals(a['wallet']);
          break;
        case 'get_transfer_status':
          result = await getTransferStatus(a);
          break;
        case 'list_transfers':
          result = await listTransfers(a);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BitGo MCP server running on stdio');
}

async function startHttp(port: number) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());

  const authToken = process.env.MCP_AUTH_TOKEN;

  // Bearer token auth middleware
  app.use('/mcp', (req, res, next) => {
    if (!authToken) return next(); // no token configured = no auth
    const header = req.headers.authorization;
    if (header !== `Bearer ${authToken}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  // Map of session ID -> { server, transport }
  const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = createServer();
    await server.connect(transport);

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    await transport.handleRequest(req, res, req.body);

    if (transport.sessionId) {
      sessions.set(transport.sessionId, { server, transport });
    }
  });

  // Handle GET for SSE streams and DELETE for session cleanup
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', sessions: sessions.size });
  });

  app.listen(port, '0.0.0.0', () => {
    console.error(`BitGo MCP server running on http://0.0.0.0:${port}/mcp`);
    if (authToken) console.error('Bearer token auth enabled');
    else console.error('WARNING: No MCP_AUTH_TOKEN set — running without auth');
  });
}

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  if (port) {
    await startHttp(port);
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
