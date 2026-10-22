// Snippets de conexion compartidos por la consola (McpConnect) y la landing: una sola fuente para que no diverjan.
// La clave siempre viaja en el header Authorization, nunca en la URL (queda en logs e historial).
// Formatos verificados el 2026-10-12: Claude Code (probado contra el servidor), Cursor y Cline (Context7),
// Windsurf (docs oficiales) y Claude Desktop via mcp-remote (Context7). Los demas no se probaron en vivo.
export type ClientId = 'claude_code' | 'cursor' | 'claude_desktop' | 'windsurf' | 'cline' | 'openai_sdk' | 'curl';

export interface ClientSnippet {
  name: string;
  label: string;
  instruction: string;
  kind: 'command' | 'json';
  snippet: string;
}

export const KEY_PLACEHOLDER = '<YOUR_ENTROPOS_KEY>';

export const maskKey = (key: string) => {
  if (!key) return '';
  if (key.length <= 12) return 'entropos_••••••';
  return key.slice(0, 9) + '••••••••' + key.slice(-4);
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

export function buildClientSnippets(origin: string, key: string): Record<ClientId, ClientSnippet> {
  const mcpUrl = `${origin}/mcp`;
  const bearer = `Bearer ${key}`;

  return {
    claude_code: {
      name: 'Claude Code',
      label: 'CLI Tool',
      instruction: 'Run this in your terminal to register Entropos as a remote MCP server (HTTP transport):',
      kind: 'command',
      snippet: `claude mcp add --transport http entropos ${mcpUrl} --header "Authorization: ${bearer}"`,
    },
    cursor: {
      name: 'Cursor',
      label: 'IDE',
      instruction: 'Add this block to .cursor/mcp.json in your project, or to ~/.cursor/mcp.json for every project:',
      kind: 'json',
      snippet: json({ mcpServers: { entropos: { url: mcpUrl, headers: { Authorization: bearer } } } }),
    },
    claude_desktop: {
      name: 'Claude Desktop',
      label: 'Desktop App',
      instruction:
        'Claude Desktop reaches remote servers through the mcp-remote bridge (needs Node.js). Add this to claude_desktop_config.json:',
      kind: 'json',
      snippet: json({
        mcpServers: {
          entropos: {
            command: 'npx',
            args: ['-y', 'mcp-remote', mcpUrl, '--header', 'Authorization:${AUTH_HEADER}'],
            env: { AUTH_HEADER: bearer },
          },
        },
      }),
    },
    windsurf: {
      name: 'Windsurf',
      label: 'IDE',
      instruction: 'In Cascade, open MCP servers > View raw config and add this to mcp_config.json:',
      kind: 'json',
      snippet: json({ mcpServers: { entropos: { serverUrl: mcpUrl, headers: { Authorization: bearer } } } }),
    },
    cline: {
      name: 'Cline',
      label: 'VS Code Extension',
      instruction: 'In Cline, open MCP Servers > Configure and add this to cline_mcp_settings.json:',
      kind: 'json',
      snippet: json({
        mcpServers: { entropos: { type: 'streamableHttp', url: mcpUrl, headers: { Authorization: bearer } } },
      }),
    },
    openai_sdk: {
      name: 'OpenAI SDK',
      label: 'Python Drop-in',
      instruction: 'Point your standard OpenAI client at Entropos; each request is analyzed and routed:',
      kind: 'command',
      snippet: `# Python\nfrom openai import OpenAI\n\nclient = OpenAI(\n    base_url="${origin}/v1",\n    api_key="${key}"\n)\n\nresponse = client.chat.completions.create(\n    model="entropos-auto",\n    messages=[{"role": "user", "content": "Refactor AST parser in Rust"}]\n)\nprint(response.choices[0].message.content)`,
    },
    curl: {
      name: 'cURL / REST',
      label: 'HTTP Endpoint',
      instruction: 'Direct HTTP POST to the OpenAI-compatible completions endpoint with your bearer token:',
      kind: 'command',
      snippet: `curl -X POST "${origin}/v1/chat/completions" \\\n  -H "Authorization: ${bearer}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "entropos-auto", "messages": [{"role": "user", "content": "Optimize PostgreSQL query with index"}]}'`,
    },
  };
}
