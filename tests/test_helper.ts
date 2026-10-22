import http from 'node:http';
import { app } from '../server';
import { productionStore } from '../src/server/storage';

export interface TestServerContext {
  server: http.Server;
  baseUrl: string;
  workspaceKey: string;
  close: () => Promise<void>;
}

export async function createTestServer(): Promise<TestServerContext> {
  const apiKeyObj = productionStore.createApiKey('CI Test Key', 'test_runner');
  const workspaceKey = apiKeyObj.key;

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return {
    server,
    baseUrl,
    workspaceKey,
    close,
  };
}
