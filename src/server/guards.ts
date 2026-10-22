import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { productionStore } from './storage';

export function safeEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function readToken(req: Request): string {
  const header = String(req.headers['authorization'] || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return String(req.headers['x-entropos-admin-token'] || '').trim();
}

// Sin ENTROPOS_ADMIN_TOKEN: en desarrollo pasa (la consola local sigue funcionando); en produccion falla cerrado.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ENTROPOS_ADMIN_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'ENTROPOS_ADMIN_TOKEN is not configured' });
    }
    return next();
  }
  if (!safeEqual(readToken(req), expected)) {
    return res.status(401).json({
      error: 'Admin token required. Enter it in the console "Admin token" field or send Authorization: Bearer <ENTROPOS_ADMIN_TOKEN>.',
    });
  }
  next();
}

// Autenticacion de usuario de workspace o token de admin para gestion de claves y suscripciones
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);

  // 1. Session token
  if (token) {
    const session = productionStore.getSession(token);
    if (session) {
      (req as any).user = session.user;
      (req as any).workspaceId = session.workspace.id;
      (req as any).workspace = session.workspace;
      return next();
    }
  }

  // 2. Admin token
  const expectedAdmin = process.env.ENTROPOS_ADMIN_TOKEN;
  if (expectedAdmin && token && safeEqual(token, expectedAdmin)) {
    (req as any).workspaceId = 'ws_default';
    return next();
  }

  // 3. Dev environment bypass when no admin token configured
  if (!expectedAdmin && process.env.NODE_ENV !== 'production') {
    (req as any).workspaceId = 'ws_default';
    return next();
  }

  return res.status(401).json({
    error: 'Authentication required. Please log in or provide a valid session token.',
  });
}

// Clave de workspace de un cliente: solo Authorization: Bearer (nunca en la URL).
export function bearerToken(req: Request): string {
  const header = String(req.headers['authorization'] || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

interface RateRule {
  windowMs: number;
  max: number;
}

const hits = new Map<string, { count: number; resetAt: number }>();

// Ventana fija por IP y ruta. Tras un proxy inverso hace falta app.set('trust proxy', ...) para que req.ip sea el cliente real.
export function rateLimit(name: string, rule: RateRule) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    const key = `${name}:${req.ip ?? 'unknown'}`;
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + rule.windowMs });
      res.setHeader('X-RateLimit-Limit', rule.max.toString());
      res.setHeader('X-RateLimit-Remaining', (rule.max - 1).toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + rule.windowMs) / 1000).toString());
      return next();
    }
    const remaining = Math.max(0, rule.max - entry.count);
    res.setHeader('X-RateLimit-Limit', rule.max.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());
    if (entry.count >= rule.max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000).toString());
      return res.status(429).json({ error: 'Too many requests' });
    }
    entry.count += 1;
    res.setHeader('X-RateLimit-Remaining', Math.max(0, rule.max - entry.count).toString());
    next();
  };
}
