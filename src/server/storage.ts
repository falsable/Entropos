import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  CustomRule,
  WorkspaceApiKey,
  PublicWorkspaceKey,
  RouteExecution,
  RoutingMode,
  RetentionPolicy,
  SubscriptionState,
  SubscriptionPlanId,
  ModelPosterior,
  ClosedLoopFeedbackEvent,
  UserRecord,
  WorkspaceRecord,
} from '../types/router';
import { DEFAULT_CUSTOM_RULES, INITIAL_MODEL_POSTERIORS, updatePosteriorWithFeedback as updateEnginePosterior } from '../lib/routerEngine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DEFAULT_DB_PATH = path.resolve(DATA_DIR, 'entropos.db');

export interface ProviderSecret {
  providerId: string;
  apiKey: string;
  maskedKey: string;
  updatedAt: string;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: number;
  tripCount: number;
}

export interface ProductionState {
  version: string;
  settings: {
    mode: RoutingMode;
    monthlyBudgetCapUsd: number;
    circuitBreakerThreshold: number;
    retentionPolicy: RetentionPolicy;
  };
  subscription: SubscriptionState;
  apiKeys: WorkspaceApiKey[];
  providerSecrets: Record<string, ProviderSecret>;
  customRules: CustomRule[];
  usageTotals: {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
    totalSavedUsd: number;
  };
  circuitBreakers: Record<string, CircuitBreakerState>;
  posteriors: Record<string, ModelPosterior>;
  feedbacks: ClosedLoopFeedbackEvent[];
  logs: RouteExecution[];
}

function nextPeriodEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DEFAULT_SETTINGS_STATE = {
  mode: 'adaptive' as RoutingMode,
  monthlyBudgetCapUsd: 150.0,
  circuitBreakerThreshold: 3,
  retentionPolicy: 'metadata_only' as RetentionPolicy,
};

const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  planId: 'developer',
  planName: 'Developer',
  status: 'active',
  monthlyQuota: 50000,
  usedThisMonth: 0,
  currentPeriodEnd: nextPeriodEnd(),
  features: [
    'Hasta 50.000 peticiones enrutadas al mes',
    'Endpoint Model Context Protocol (MCP) HTTP/SSE',
    'Proxy virtual compatible con OpenAI (/v1)',
    'Enrutamiento adaptativo de coste y calidad',
    'Política de cero retención de datos configurable',
    'Soporte comunitario estándar',
  ],
};

const SEEDED_KEY_IDS = new Set(['key_prod_default', 'key_prod_cursor', 'key_legacy_jev']);

// ---------------------------------------------------------------------------
// ENCRYPTION HELPERS (AES-256-GCM)
// ---------------------------------------------------------------------------
export function getStorageEncryptionKey(): Buffer {
  if (process.env.STORAGE_ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(process.env.STORAGE_ENCRYPTION_KEY).digest();
  }
  const secretFile = path.resolve(DATA_DIR, '.entropos_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const raw = fs.readFileSync(secretFile, 'utf-8').trim();
      if (raw.length === 64) {
        return Buffer.from(raw, 'hex');
      }
    }
    const generated = crypto.randomBytes(32);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(secretFile, generated.toString('hex'), { mode: 0o600 });
    return generated;
  } catch {
    return crypto.createHash('sha256').update('entropos_default_in_memory_salt').digest();
  }
}

export function encryptSecret(plainText: string, key = getStorageEncryptionKey()): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

export function decryptSecret(encrypted: string, iv: string, authTag: string, key = getStorageEncryptionKey()): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---------------------------------------------------------------------------
// PASSWORD HASHING HELPERS (scrypt)
// ---------------------------------------------------------------------------
export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = hashPassword(password, salt);
  const a = Buffer.from(actualHash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// PRODUCTION STORAGE (SQLITE WAL ENGINE)
// ---------------------------------------------------------------------------
export class ProductionStorage {
  private db: DatabaseSync;
  public readonly dbPath: string;

  constructor(customDbPath?: string) {
    this.dbPath = customDbPath || process.env.ENTROPOS_DB_PATH || DEFAULT_DB_PATH;
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(this.dbPath);
    this.configurePragmas();
    this.createTables();
    this.migrateFromLegacyJsonIfApplicable();
  }

  private configurePragmas() {
    this.db.exec('PRAGMA busy_timeout = 5000;');
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }
  }

  private createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        authProvider TEXT NOT NULL,
        passwordHash TEXT,
        salt TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ownerUserId TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(ownerUserId);

      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        workspaceId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);

      CREATE TABLE IF NOT EXISTS workspace_subscriptions (
        workspaceId TEXT PRIMARY KEY,
        rawJson TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        clientName TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        lastUsedAt TEXT,
        workspaceId TEXT NOT NULL DEFAULT 'ws_default'
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_token ON api_keys(key);

      CREATE TABLE IF NOT EXISTS provider_secrets (
        providerId TEXT PRIMARY KEY,
        encryptedKey TEXT NOT NULL,
        iv TEXT NOT NULL,
        authTag TEXT NOT NULL,
        maskedKey TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custom_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        condition TEXT NOT NULL,
        value TEXT NOT NULL,
        targetModel TEXT NOT NULL,
        targetProvider TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS usage_totals (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        totalRequests INTEGER NOT NULL DEFAULT 0,
        totalTokens INTEGER NOT NULL DEFAULT 0,
        totalCostUsd REAL NOT NULL DEFAULT 0,
        totalSavedUsd REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS circuit_breakers (
        providerId TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'closed',
        failureCount INTEGER NOT NULL DEFAULT 0,
        tripCount INTEGER NOT NULL DEFAULT 0,
        lastFailureTime INTEGER
      );

      CREATE TABLE IF NOT EXISTS model_posteriors (
        modelName TEXT PRIMARY KEY,
        rawJson TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feedbacks (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        rawJson TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_feedbacks_ts ON feedbacks(timestamp DESC);

      CREATE TABLE IF NOT EXISTS route_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        selectedModel TEXT NOT NULL,
        provider TEXT NOT NULL,
        costUsd REAL,
        savedUsd REAL,
        speedLatencyMs INTEGER,
        rawJson TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_route_logs_ts ON route_logs(timestamp DESC);
    `);

    // Ensure api_keys has workspaceId column if it was created in older schema
    try {
      this.db.exec(`ALTER TABLE api_keys ADD COLUMN workspaceId TEXT NOT NULL DEFAULT 'ws_default';`);
    } catch {
      // Column already exists
    }

    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_ws ON api_keys(workspaceId);`);
    } catch {
      // Non-fatal
    }

    // Ensure default workspace exists
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO workspaces (id, name, ownerUserId, createdAt)
        VALUES ('ws_default', 'Default Workspace', 'usr_default', '2026-01-01T00:00:00.000Z')
      `).run();
    } catch {
      // Non-fatal
    }
  }

  private migrateFromLegacyJsonIfApplicable() {
    const metaCheck = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('version') as { value: string } | undefined;
    if (metaCheck) return; // Already initialized

    // Check for legacy JSON store
    const legacyCandidates = [
      path.resolve(DATA_DIR, 'entropos_production_store.json'),
      path.resolve(DATA_DIR, 'jev_production_store.json'),
    ];

    let legacyFile: string | null = null;
    for (const cand of legacyCandidates) {
      if (fs.existsSync(cand)) {
        legacyFile = cand;
        break;
      }
    }

    if (legacyFile) {
      try {
        const raw = fs.readFileSync(legacyFile, 'utf-8');
        const parsed = JSON.parse(raw);
        this.applyInitialState(parsed);

        // Rename legacy file to prevent duplicate migrations
        try {
          fs.renameSync(legacyFile, `${legacyFile}.migrated`);
        } catch {
          // Keep if rename fails
        }
        return;
      } catch (err) {
        console.warn('Failed to parse legacy JSON store, initializing clean defaults:', err);
      }
    }

    // Clean initialization
    this.applyInitialState({});
  }

  private applyInitialState(data: Partial<ProductionState>) {
    const version = data.version || '1.2.0';
    const settings = data.settings || DEFAULT_SETTINGS_STATE;
    const subscription = data.subscription || DEFAULT_SUBSCRIPTION_STATE;

    this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('version', version);
    this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('settings', JSON.stringify(settings));
    this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('subscription', JSON.stringify(subscription));

    // Usage totals
    const usage = data.usageTotals || { totalRequests: 0, totalTokens: 0, totalCostUsd: 0, totalSavedUsd: 0 };
    this.db.prepare(`
      INSERT OR REPLACE INTO usage_totals (id, totalRequests, totalTokens, totalCostUsd, totalSavedUsd)
      VALUES (1, ?, ?, ?, ?)
    `).run(usage.totalRequests, usage.totalTokens, usage.totalCostUsd, usage.totalSavedUsd);

    // API Keys (purging any seeded public keys)
    const apiKeys = Array.isArray(data.apiKeys) ? data.apiKeys.filter((k) => !SEEDED_KEY_IDS.has(k.id)) : [];
    const insertKey = this.db.prepare(`
      INSERT OR REPLACE INTO api_keys (id, name, key, clientName, createdAt, lastUsedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const k of apiKeys) {
      insertKey.run(k.id, k.name, k.key, k.clientName, k.createdAt, k.lastUsedAt || null);
    }

    // Provider Secrets (encrypted)
    const providerSecrets = data.providerSecrets || {};
    const insertSecret = this.db.prepare(`
      INSERT OR REPLACE INTO provider_secrets (providerId, encryptedKey, iv, authTag, maskedKey, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [providerId, sec] of Object.entries(providerSecrets)) {
      if (sec && sec.apiKey) {
        const { encrypted, iv, authTag } = encryptSecret(sec.apiKey);
        insertSecret.run(providerId, encrypted, iv, authTag, sec.maskedKey || sec.apiKey.slice(0, 7) + '...', sec.updatedAt || new Date().toISOString());
      }
    }

    // Custom Rules
    const customRules = Array.isArray(data.customRules) && data.customRules.length > 0 ? data.customRules : DEFAULT_CUSTOM_RULES;
    const insertRule = this.db.prepare(`
      INSERT OR REPLACE INTO custom_rules (id, name, condition, value, targetModel, targetProvider, enabled, sortOrder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    customRules.forEach((r, idx) => {
      insertRule.run(r.id, r.name, r.condition, r.value, r.targetModel, r.targetProvider, r.enabled ? 1 : 0, idx);
    });

    // Circuit Breakers
    const defaultCircuits: Record<string, CircuitBreakerState> = {
      anthropic: { state: 'closed', failureCount: 0, tripCount: 0 },
      gemini: { state: 'closed', failureCount: 0, tripCount: 0 },
      openai: { state: 'closed', failureCount: 0, tripCount: 0 },
      deepseek: { state: 'closed', failureCount: 0, tripCount: 0 },
      groq: { state: 'closed', failureCount: 0, tripCount: 0 },
    };
    const circuitBreakers = { ...defaultCircuits, ...(data.circuitBreakers || {}) };
    const insertCircuit = this.db.prepare(`
      INSERT OR REPLACE INTO circuit_breakers (providerId, state, failureCount, tripCount, lastFailureTime)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const [providerId, cb] of Object.entries(circuitBreakers)) {
      insertCircuit.run(providerId, cb.state || 'closed', cb.failureCount || 0, cb.tripCount || 0, cb.lastFailureTime || null);
    }

    // Model Posteriors
    const posteriors = data.posteriors || INITIAL_MODEL_POSTERIORS;
    const insertPosterior = this.db.prepare(`
      INSERT OR REPLACE INTO model_posteriors (modelName, rawJson)
      VALUES (?, ?)
    `);
    for (const [modelName, p] of Object.entries(posteriors)) {
      insertPosterior.run(modelName, JSON.stringify(p));
    }

    // Feedbacks
    if (Array.isArray(data.feedbacks)) {
      const insertFb = this.db.prepare(`
        INSERT OR REPLACE INTO feedbacks (id, timestamp, rawJson)
        VALUES (?, ?, ?)
      `);
      for (const fb of data.feedbacks) {
        insertFb.run(fb.id, fb.timestamp, JSON.stringify(fb));
      }
    }

    // Route Logs
    if (Array.isArray(data.logs)) {
      const insertLog = this.db.prepare(`
        INSERT OR REPLACE INTO route_logs (
          id, timestamp, selectedModel, provider, costUsd, savedUsd, speedLatencyMs, rawJson
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const log of data.logs) {
        insertLog.run(
          log.id,
          log.timestamp,
          log.selectedModel,
          log.provider,
          log.costUsd ?? 0,
          log.savedUsd ?? 0,
          log.speedLatencyMs ?? 0,
          JSON.stringify(log)
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // PUBLIC REPOSITORY APIS
  // -------------------------------------------------------------------------

  public getState(): ProductionState {
    const versionRow = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('version') as { value: string } | undefined;
    const settings = this.getSettings();
    const subscription = this.getSubscription();
    const apiKeys = this.getApiKeys();
    const customRules = this.getCustomRules();
    const usageTotals = this.getUsageTotals();
    const circuitBreakers = this.getCircuitBreakers();
    const posteriors = this.getPosteriors();
    const feedbacks = this.getRecentFeedbacks();
    const logs = this.getLogs();

    // Provider Secrets listing (masked)
    const secretRows = this.db.prepare('SELECT providerId, maskedKey, updatedAt FROM provider_secrets').all() as any[];
    const providerSecrets: Record<string, ProviderSecret> = {};
    for (const r of secretRows) {
      providerSecrets[r.providerId] = {
        providerId: r.providerId,
        apiKey: '', // Never leak raw secrets in getState()
        maskedKey: r.maskedKey,
        updatedAt: r.updatedAt,
      };
    }

    return {
      version: versionRow ? versionRow.value : '1.2.0',
      settings,
      subscription,
      apiKeys,
      providerSecrets,
      customRules,
      usageTotals,
      circuitBreakers,
      posteriors,
      feedbacks,
      logs,
    };
  }

  public getSettings(): ProductionState['settings'] {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('settings') as { value: string } | undefined;
    if (!row) return { ...DEFAULT_SETTINGS_STATE };
    try {
      return { ...DEFAULT_SETTINGS_STATE, ...JSON.parse(row.value) };
    } catch {
      return { ...DEFAULT_SETTINGS_STATE };
    }
  }

  public updateSettings(partial: Partial<ProductionState['settings']>): ProductionState['settings'] {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('settings', JSON.stringify(updated));
    return updated;
  }

  public initWorkspaceSubscription(workspaceId: string): SubscriptionState {
    const sub: SubscriptionState = {
      ...DEFAULT_SUBSCRIPTION_STATE,
      currentPeriodEnd: nextPeriodEnd(),
    };
    this.db.prepare(`
      INSERT OR REPLACE INTO workspace_subscriptions (workspaceId, rawJson)
      VALUES (?, ?)
    `).run(workspaceId, JSON.stringify(sub));
    return sub;
  }

  public getSubscription(workspaceId?: string): SubscriptionState {
    if (workspaceId && workspaceId !== 'ws_default') {
      const row = this.db.prepare('SELECT rawJson FROM workspace_subscriptions WHERE workspaceId = ?').get(workspaceId) as { rawJson: string } | undefined;
      if (row) {
        try {
          return JSON.parse(row.rawJson);
        } catch {
          // fallback
        }
      }
      return this.initWorkspaceSubscription(workspaceId);
    }

    const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('subscription') as { value: string } | undefined;
    const usage = this.getUsageTotals();
    if (!row) {
      return { ...DEFAULT_SUBSCRIPTION_STATE, usedThisMonth: usage.totalRequests };
    }
    try {
      const parsed = JSON.parse(row.value) as SubscriptionState;
      return { ...parsed, usedThisMonth: usage.totalRequests };
    } catch {
      return { ...DEFAULT_SUBSCRIPTION_STATE, usedThisMonth: usage.totalRequests };
    }
  }

  public updateSubscription(planId: SubscriptionPlanId, paymentMethod?: any, workspaceId?: string): SubscriptionState {
    const planConfigs: Record<SubscriptionPlanId, { name: string; quota: number; features: string[] }> = {
      developer: {
        name: 'Developer',
        quota: 50000,
        features: [
          'Hasta 50.000 peticiones enrutadas al mes',
          'Endpoint Model Context Protocol (MCP) HTTP/SSE',
          'Proxy virtual compatible con OpenAI (/v1)',
          'Enrutamiento adaptativo de coste y calidad',
          'Política de cero retención de datos configurable',
          'Soporte comunitario estándar',
        ],
      },
      pro: {
        name: 'Pro',
        quota: 1000000,
        features: [
          'Hasta 1.000.000 peticiones enrutadas al mes',
          'Todo lo incluido en el plan Developer',
          'Uso de claves de proveedor propias (BYOK Anthropic, OpenAI, Gemini)',
          'Estrategias de enrutamiento y reglas heurísticas personalizadas',
          'Analítica detallada de latencia y ahorro de tokens con exportación CSV',
          'Soporte técnico prioritario',
        ],
      },
      enterprise: {
        name: 'Enterprise',
        quota: 10000000,
        features: [
          'Peticiones enrutadas ilimitadas para toda la organización',
          'Todo lo incluido en el plan Pro',
          'Instancia MCP aislada dedicada con aislamiento estricto',
          'Claves de workspace multi-equipo con límites presupuestarios',
          'Integración con modelos locales autoalojados (Ollama / vLLM)',
          'SLA de latencia y acuerdos de nivel de servicio corporativos',
        ],
      },
    };

    const targetConfig = planConfigs[planId] || planConfigs.developer;
    const current = this.getSubscription(workspaceId);
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);

    const updated: SubscriptionState = {
      planId,
      planName: targetConfig.name,
      status: 'active',
      monthlyQuota: targetConfig.quota,
      usedThisMonth: this.getUsageTotals().totalRequests,
      currentPeriodEnd: nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      paymentMethod: paymentMethod || current.paymentMethod,
      features: targetConfig.features,
    };

    if (workspaceId && workspaceId !== 'ws_default') {
      this.db.prepare('INSERT OR REPLACE INTO workspace_subscriptions (workspaceId, rawJson) VALUES (?, ?)').run(workspaceId, JSON.stringify(updated));
    } else {
      this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('subscription', JSON.stringify(updated));
    }
    return updated;
  }

  public cancelSubscription(workspaceId?: string): SubscriptionState {
    const current = this.getSubscription(workspaceId);
    current.status = 'canceled';
    if (workspaceId && workspaceId !== 'ws_default') {
      this.db.prepare('INSERT OR REPLACE INTO workspace_subscriptions (workspaceId, rawJson) VALUES (?, ?)').run(workspaceId, JSON.stringify(current));
    } else {
      this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run('subscription', JSON.stringify(current));
    }
    return current;
  }

  // -------------------------------------------------------------------------
  // USERS, WORKSPACES, AND SESSIONS (Entropos-ugg.9)
  // -------------------------------------------------------------------------

  public createUser(email: string, name: string, authProvider: 'email' | 'github', password?: string): { user: UserRecord; workspace: WorkspaceRecord } {
    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    let salt: string | null = null;
    let passwordHash: string | null = null;
    if (password) {
      salt = crypto.randomBytes(16).toString('hex');
      passwordHash = hashPassword(password, salt);
    }

    this.db.prepare(`
      INSERT INTO users (id, email, name, authProvider, passwordHash, salt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, email.toLowerCase().trim(), name.trim(), authProvider, passwordHash, salt, now);

    const workspaceId = 'ws_' + crypto.randomBytes(8).toString('hex');
    const workspaceName = `${name.trim()}'s Workspace`;
    this.db.prepare(`
      INSERT INTO workspaces (id, name, ownerUserId, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(workspaceId, workspaceName, userId, now);

    this.initWorkspaceSubscription(workspaceId);

    const user: UserRecord = {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      authProvider,
      createdAt: now,
    };

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      name: workspaceName,
      ownerUserId: userId,
      createdAt: now,
    };

    return { user, workspace };
  }

  public getUserByEmail(email: string): (UserRecord & { passwordHash?: string; salt?: string }) | null {
    const row = this.db.prepare(`
      SELECT id, email, name, authProvider, passwordHash, salt, createdAt
      FROM users
      WHERE email = ?
    `).get(email.toLowerCase().trim()) as any;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      authProvider: row.authProvider,
      passwordHash: row.passwordHash || undefined,
      salt: row.salt || undefined,
      createdAt: row.createdAt,
    };
  }

  public getUserById(id: string): UserRecord | null {
    const row = this.db.prepare(`
      SELECT id, email, name, authProvider, createdAt
      FROM users
      WHERE id = ?
    `).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      authProvider: row.authProvider,
      createdAt: row.createdAt,
    };
  }

  public getWorkspaceById(id: string): WorkspaceRecord | null {
    const row = this.db.prepare(`
      SELECT id, name, ownerUserId, createdAt
      FROM workspaces
      WHERE id = ?
    `).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      ownerUserId: row.ownerUserId,
      createdAt: row.createdAt,
    };
  }

  public getWorkspaceByUserId(userId: string): WorkspaceRecord | null {
    const row = this.db.prepare(`
      SELECT id, name, ownerUserId, createdAt
      FROM workspaces
      WHERE ownerUserId = ?
      ORDER BY createdAt ASC
      LIMIT 1
    `).get(userId) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      ownerUserId: row.ownerUserId,
      createdAt: row.createdAt,
    };
  }

  public createSession(userId: string, workspaceId: string): string {
    const token = 'sess_' + crypto.randomBytes(24).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    this.db.prepare(`
      INSERT INTO user_sessions (token, userId, workspaceId, createdAt, expiresAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, userId, workspaceId, now.toISOString(), expires.toISOString());
    return token;
  }

  public getSession(token: string): { user: UserRecord; workspace: WorkspaceRecord } | null {
    if (!token) return null;
    const session = this.db.prepare(`
      SELECT token, userId, workspaceId, expiresAt
      FROM user_sessions
      WHERE token = ?
    `).get(token) as any;
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      this.deleteSession(token);
      return null;
    }
    const user = this.getUserById(session.userId);
    const workspace = this.getWorkspaceById(session.workspaceId);
    if (!user || !workspace) return null;
    return { user, workspace };
  }

  public deleteSession(token: string): void {
    if (!token) return;
    this.db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
  }

  // -------------------------------------------------------------------------
  // WORKSPACE API KEYS
  // -------------------------------------------------------------------------

  public createApiKey(name: string, clientName: string, workspaceId: string = 'ws_default'): WorkspaceApiKey {
    const apiKey: WorkspaceApiKey = {
      id: 'key_' + crypto.randomBytes(6).toString('hex'),
      name,
      key: 'entropos_live_' + crypto.randomBytes(24).toString('base64url'),
      createdAt: new Date().toISOString(),
      clientName,
      workspaceId,
    };

    this.db.prepare(`
      INSERT INTO api_keys (id, name, key, clientName, createdAt, lastUsedAt, workspaceId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(apiKey.id, apiKey.name, apiKey.key, apiKey.clientName, apiKey.createdAt, null, workspaceId);

    return apiKey;
  }

  public getApiKeys(workspaceId?: string): WorkspaceApiKey[] {
    const query = workspaceId
      ? 'SELECT id, name, key, clientName, createdAt, lastUsedAt, workspaceId FROM api_keys WHERE workspaceId = ? ORDER BY createdAt DESC'
      : 'SELECT id, name, key, clientName, createdAt, lastUsedAt, workspaceId FROM api_keys ORDER BY createdAt DESC';
    const rows = (workspaceId
      ? this.db.prepare(query).all(workspaceId)
      : this.db.prepare(query).all()) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key,
      clientName: r.clientName,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt || undefined,
      workspaceId: r.workspaceId || 'ws_default',
    }));
  }

  public getPublicApiKeys(workspaceId?: string): PublicWorkspaceKey[] {
    return this.getApiKeys(workspaceId).map(({ id, name, clientName, createdAt, lastUsedAt, key, workspaceId: wsId }) => ({
      id,
      name,
      clientName,
      createdAt,
      lastUsedAt,
      last4: key.slice(-4),
      workspaceId: wsId,
    }));
  }

  public getApiKeyByToken(keyToken: string): WorkspaceApiKey | null {
    if (!keyToken) return null;
    const row = this.db.prepare('SELECT id, name, key, clientName, createdAt, lastUsedAt, workspaceId FROM api_keys WHERE key = ? LIMIT 1').get(keyToken) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      key: row.key,
      clientName: row.clientName,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt || undefined,
      workspaceId: row.workspaceId || 'ws_default',
    };
  }

  public validateApiKey(keyToken: string): boolean {
    if (!keyToken) return false;
    const row = this.db.prepare('SELECT id FROM api_keys WHERE key = ? LIMIT 1').get(keyToken) as { id: string } | undefined;
    if (!row) return false;

    // Record last used time
    try {
      this.db.prepare('UPDATE api_keys SET lastUsedAt = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    } catch {
      // non-fatal
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // PROVIDER SECRETS (ENCRYPTED AT REST)
  // -------------------------------------------------------------------------

  public setProviderSecret(providerId: string, apiKey: string) {
    const masked = apiKey.slice(0, 7) + '...' + apiKey.slice(-4);
    const { encrypted, iv, authTag } = encryptSecret(apiKey);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO provider_secrets (providerId, encryptedKey, iv, authTag, maskedKey, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(providerId, encrypted, iv, authTag, masked, now);
  }

  public getProviderSecret(providerId: string): string | undefined {
    const row = this.db.prepare(`
      SELECT encryptedKey, iv, authTag
      FROM provider_secrets
      WHERE providerId = ?
    `).get(providerId) as { encryptedKey: string; iv: string; authTag: string } | undefined;

    if (!row) return undefined;
    try {
      return decryptSecret(row.encryptedKey, row.iv, row.authTag);
    } catch (err) {
      console.error(`Failed to decrypt secret for provider ${providerId}:`, err);
      return undefined;
    }
  }

  public deleteProviderSecret(providerId: string): void {
    this.db.prepare(`DELETE FROM provider_secrets WHERE providerId = ?`).run(providerId);
  }

  public getAllProviderSecrets(): Array<{ providerId: string; maskedKey: string; updatedAt: string }> {
    return this.db.prepare(`
      SELECT providerId, maskedKey, updatedAt
      FROM provider_secrets
    `).all() as Array<{ providerId: string; maskedKey: string; updatedAt: string }>;
  }

  // -------------------------------------------------------------------------
  // CUSTOM USER RULES
  // -------------------------------------------------------------------------

  public getCustomRules(): CustomRule[] {
    const rows = this.db.prepare(`
      SELECT id, name, condition, value, targetModel, targetProvider, enabled
      FROM custom_rules
      ORDER BY sortOrder ASC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      condition: r.condition,
      value: r.value,
      targetModel: r.targetModel,
      targetProvider: r.targetProvider,
      enabled: Boolean(r.enabled),
    }));
  }

  public updateCustomRules(rules: CustomRule[]): CustomRule[] {
    this.db.exec('DELETE FROM custom_rules;');
    const insert = this.db.prepare(`
      INSERT INTO custom_rules (id, name, condition, value, targetModel, targetProvider, enabled, sortOrder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rules.forEach((r, idx) => {
      insert.run(r.id, r.name, r.condition, r.value, r.targetModel, r.targetProvider, r.enabled ? 1 : 0, idx);
    });
    return rules;
  }

  // -------------------------------------------------------------------------
  // USAGE & ROUTE LOGS
  // -------------------------------------------------------------------------

  public getUsageTotals(): ProductionState['usageTotals'] {
    const row = this.db.prepare(`
      SELECT totalRequests, totalTokens, totalCostUsd, totalSavedUsd
      FROM usage_totals
      WHERE id = 1
    `).get() as any;

    if (!row) {
      return { totalRequests: 0, totalTokens: 0, totalCostUsd: 0, totalSavedUsd: 0 };
    }

    return {
      totalRequests: Number(row.totalRequests) || 0,
      totalTokens: Number(row.totalTokens) || 0,
      totalCostUsd: Number(row.totalCostUsd) || 0,
      totalSavedUsd: Number(row.totalSavedUsd) || 0,
    };
  }

  public getRetentionPolicy(): RetentionPolicy {
    const sub = this.getSubscription();
    const settings = this.getSettings();
    if (sub.planId === 'enterprise' && (!settings.retentionPolicy || settings.retentionPolicy === 'metadata_only')) {
      return 'zero_retention';
    }
    return settings.retentionPolicy || 'metadata_only';
  }

  public recordExecution(execution: RouteExecution) {
    const tokens = execution.hasMeasuredUsage && execution.totalTokens ? execution.totalTokens : 0;
    const cost = execution.hasMeasuredUsage && execution.costUsd ? execution.costUsd : 0;
    const saved = execution.hasMeasuredUsage && execution.savedUsd ? execution.savedUsd : 0;

    // 1. Update running metrics atomically
    this.db.prepare(`
      UPDATE usage_totals
      SET totalRequests = totalRequests + 1,
          totalTokens = totalTokens + ?,
          totalCostUsd = totalCostUsd + ?,
          totalSavedUsd = totalSavedUsd + ?
      WHERE id = 1
    `).run(tokens, cost, saved);

    // 2. Content scrubbing based on retention policy
    const policy = this.getRetentionPolicy();
    const isEnterprise = this.getSubscription().planId === 'enterprise';
    const effectivePolicy = isEnterprise && policy === 'full' ? 'metadata_only' : policy;

    const promptSnippet =
      effectivePolicy === 'zero_retention'
        ? ''
        : effectivePolicy === 'metadata_only'
        ? (execution.promptSnippet ? execution.promptSnippet.slice(0, 60) : '')
        : (execution.promptSnippet || '');

    const fullPrompt = effectivePolicy === 'full' ? (execution.fullPrompt || '') : '';
    const responseText = effectivePolicy === 'full' ? (execution.responseText || '') : '';

    const sanitized: RouteExecution = {
      ...execution,
      promptSnippet,
      fullPrompt,
      responseText,
    };

    // Moat scrubbing: Never write internal algorithmic details to persistent disk
    delete (sanitized as any).shannonEntropyBits;
    delete (sanitized as any).thompsonScore;
    delete (sanitized as any).posteriorMean;
    delete (sanitized as any).entropyScore;
    delete (sanitized as any).wasExploration;

    // Sanitize reason string if it describes the private algorithm
    if (
      sanitized.reason &&
      !sanitized.reason.startsWith('Matched Custom Rule') &&
      !sanitized.reason.startsWith('Failover Event') &&
      !sanitized.reason.startsWith('Adaptive Circuit Breaker')
    ) {
      sanitized.reason = `Routed to ${sanitized.selectedModel} · ${sanitized.complexityTier || 'Balanced'} workload`;
    }

    // 3. Append route log entry
    this.db.prepare(`
      INSERT OR REPLACE INTO route_logs (
        id, timestamp, selectedModel, provider, costUsd, savedUsd, speedLatencyMs, rawJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sanitized.id,
      sanitized.timestamp,
      sanitized.selectedModel,
      sanitized.provider,
      sanitized.costUsd ?? 0,
      sanitized.savedUsd ?? 0,
      sanitized.speedLatencyMs ?? 0,
      JSON.stringify(sanitized)
    );
  }

  public getLogs(): RouteExecution[] {
    const rows = this.db.prepare(`
      SELECT rawJson
      FROM route_logs
      ORDER BY timestamp DESC
      LIMIT 100
    `).all() as any[];

    const results: RouteExecution[] = [];
    for (const r of rows) {
      try {
        results.push(JSON.parse(r.rawJson));
      } catch {
        // Skip corrupt record
      }
    }
    return results;
  }

  /** Sum of recorded costUsd for route logs in [fromIso, toIso) (all rows, not just the last 100). */
  public getCostSince(fromIso: string, toIso?: string): number {
    const row = (toIso
      ? this.db.prepare('SELECT COALESCE(SUM(costUsd), 0) AS total FROM route_logs WHERE timestamp >= ? AND timestamp < ?').get(fromIso, toIso)
      : this.db.prepare('SELECT COALESCE(SUM(costUsd), 0) AS total FROM route_logs WHERE timestamp >= ?').get(fromIso)
    ) as { total: number } | undefined;
    return Number(row?.total ?? 0);
  }

  public getLogsSince(cutoffIso: string): RouteExecution[] {
    const rows = this.db.prepare(`
      SELECT rawJson
      FROM route_logs
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `).all(cutoffIso) as any[];

    const results: RouteExecution[] = [];
    for (const r of rows) {
      try {
        results.push(JSON.parse(r.rawJson));
      } catch {
        // Skip corrupt record
      }
    }
    return results;
  }

  public getFilteredLogs(options: {
    page?: number;
    limit?: number;
    mode?: string;
    model?: string;
    search?: string;
  } = {}): { logs: RouteExecution[]; total: number; page: number; totalPages: number } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (options.model && typeof options.model === 'string' && options.model.trim()) {
      whereClauses.push('LOWER(selectedModel) = LOWER(?)');
      params.push(options.model.trim());
    }

    if (options.mode && typeof options.mode === 'string' && options.mode.trim()) {
      whereClauses.push('rawJson LIKE ?');
      params.push(`%"mode":"${options.mode.trim()}"%`);
    }

    if (options.search && typeof options.search === 'string' && options.search.trim()) {
      whereClauses.push('(selectedModel LIKE ? OR provider LIKE ? OR rawJson LIKE ?)');
      const term = `%${options.search.trim()}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = this.db.prepare(`SELECT COUNT(*) as total FROM route_logs ${whereSql}`).get(...params) as any;
    const total = Number(countRow?.total) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = this.db.prepare(`
      SELECT rawJson
      FROM route_logs
      ${whereSql}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    const logs: RouteExecution[] = [];
    for (const r of rows) {
      try {
        logs.push(JSON.parse(r.rawJson));
      } catch {
        // Skip corrupt record
      }
    }

    return { logs, total, page, totalPages };
  }

  // -------------------------------------------------------------------------
  // CIRCUIT BREAKERS
  // -------------------------------------------------------------------------

  public getCircuitBreakers(): ProductionState['circuitBreakers'] {
    const rows = this.db.prepare(`
      SELECT providerId, state, failureCount, tripCount, lastFailureTime
      FROM circuit_breakers
    `).all() as any[];

    const result: ProductionState['circuitBreakers'] = {
      anthropic: { state: 'closed', failureCount: 0, tripCount: 0 },
      gemini: { state: 'closed', failureCount: 0, tripCount: 0 },
      openai: { state: 'closed', failureCount: 0, tripCount: 0 },
      deepseek: { state: 'closed', failureCount: 0, tripCount: 0 },
      groq: { state: 'closed', failureCount: 0, tripCount: 0 },
    };

    for (const r of rows) {
      result[r.providerId] = {
        state: r.state,
        failureCount: Number(r.failureCount) || 0,
        tripCount: Number(r.tripCount) || 0,
        lastFailureTime: r.lastFailureTime ? Number(r.lastFailureTime) : undefined,
      };
    }
    return result;
  }

  public recordCircuitSuccess(providerId: string) {
    this.db.prepare(`
      INSERT INTO circuit_breakers (providerId, state, failureCount, tripCount, lastFailureTime)
      VALUES (?, 'closed', 0, 0, NULL)
      ON CONFLICT(providerId) DO UPDATE SET
        failureCount = 0,
        state = CASE WHEN state = 'half-open' THEN 'closed' ELSE state END
    `).run(providerId);
  }

  public recordCircuitFailure(providerId: string) {
    const threshold = this.getSettings().circuitBreakerThreshold || 3;
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO circuit_breakers (providerId, state, failureCount, tripCount, lastFailureTime)
      VALUES (?, 'closed', 1, 0, ?)
      ON CONFLICT(providerId) DO UPDATE SET
        failureCount = failureCount + 1,
        lastFailureTime = ?,
        state = CASE WHEN failureCount + 1 >= ? THEN 'open' ELSE state END,
        tripCount = CASE WHEN failureCount + 1 >= ? THEN tripCount + 1 ELSE tripCount END
    `).run(providerId, now, now, threshold, threshold);
  }

  public isCircuitAvailable(providerId: string): boolean {
    const row = this.db.prepare(`
      SELECT state, lastFailureTime
      FROM circuit_breakers
      WHERE providerId = ?
    `).get(providerId) as { state: 'closed' | 'open' | 'half-open'; lastFailureTime: number | null } | undefined;

    if (!row) return true;
    if (row.state === 'closed') return true;
    if (row.state === 'open') {
      const now = Date.now();
      if (row.lastFailureTime && now - row.lastFailureTime > 30000) {
        this.db.prepare(`
          UPDATE circuit_breakers
          SET state = 'half-open'
          WHERE providerId = ?
        `).run(providerId);
        return true;
      }
      return false;
    }
    return true; // half-open probe allowed
  }

  public tripCircuitManually(providerId: string) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO circuit_breakers (providerId, state, failureCount, tripCount, lastFailureTime)
      VALUES (?, 'open', 3, 1, ?)
      ON CONFLICT(providerId) DO UPDATE SET
        state = 'open',
        failureCount = 3,
        tripCount = tripCount + 1,
        lastFailureTime = ?
    `).run(providerId, now, now);
  }

  public resetCircuits() {
    this.db.prepare(`
      UPDATE circuit_breakers
      SET state = 'closed', failureCount = 0
    `).run();
  }

  // -------------------------------------------------------------------------
  // ADAPTIVE POSTERIORS & FEEDBACK
  // -------------------------------------------------------------------------

  public getPosteriors(): Record<string, ModelPosterior> {
    const rows = this.db.prepare(`
      SELECT modelName, rawJson
      FROM model_posteriors
    `).all() as any[];

    if (rows.length === 0) {
      return { ...INITIAL_MODEL_POSTERIORS };
    }

    const result: Record<string, ModelPosterior> = {};
    for (const r of rows) {
      try {
        result[r.modelName] = JSON.parse(r.rawJson);
      } catch {
        // Skip corrupt entry
      }
    }
    return result;
  }

  public recordFeedback(
    modelName: string,
    outcome: 'success' | 'failure' | 'retry' | 'hallucination',
    qualityScore = 5,
    latencyMs?: number,
    toolExecutionSuccess = true,
    comment?: string,
    requestId?: string
  ): { updatedPosterior: ModelPosterior; event: ClosedLoopFeedbackEvent } {
    const updated = updateEnginePosterior(modelName, outcome, qualityScore, latencyMs);

    // Save updated posterior
    this.db.prepare(`
      INSERT OR REPLACE INTO model_posteriors (modelName, rawJson)
      VALUES (?, ?)
    `).run(modelName, JSON.stringify(updated));

    const rewardDelta = outcome === 'success' ? (qualityScore >= 4 ? 2.0 : 1.0) : (outcome === 'retry' ? -1.5 : -3.0);
    const event: ClosedLoopFeedbackEvent = {
      id: 'fb_' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      requestId: requestId || 'req_auto_' + Math.random().toString(36).substring(2, 6),
      model: modelName,
      provider: updated.provider,
      outcome,
      qualityScore,
      latencyMs: latencyMs || updated.latencyP50Ms,
      toolExecutionSuccess,
      rewardDelta,
      comment: comment || `Downstream execution reported ${outcome} with quality score ${qualityScore}/5`,
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO feedbacks (id, timestamp, rawJson)
      VALUES (?, ?, ?)
    `).run(event.id, event.timestamp, JSON.stringify(event));

    return { updatedPosterior: updated, event };
  }

  public getRecentFeedbacks(): ClosedLoopFeedbackEvent[] {
    const rows = this.db.prepare(`
      SELECT rawJson
      FROM feedbacks
      ORDER BY timestamp DESC
      LIMIT 50
    `).all() as any[];

    const result: ClosedLoopFeedbackEvent[] = [];
    for (const r of rows) {
      try {
        result.push(JSON.parse(r.rawJson));
      } catch {
        // Skip corrupt entry
      }
    }
    return result;
  }

  public resetPosteriors(): Record<string, ModelPosterior> {
    this.db.exec('DELETE FROM model_posteriors;');
    const insert = this.db.prepare(`
      INSERT INTO model_posteriors (modelName, rawJson)
      VALUES (?, ?)
    `);
    for (const [modelName, p] of Object.entries(INITIAL_MODEL_POSTERIORS)) {
      insert.run(modelName, JSON.stringify(p));
    }
    return { ...INITIAL_MODEL_POSTERIORS };
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // ignore
    }
  }
}

export const productionStore = new ProductionStorage();
