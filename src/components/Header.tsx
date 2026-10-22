import React, { useState } from 'react';
import { Check, Terminal, LogOut, Menu, X } from 'lucide-react';
import { SubscriptionState } from '../types/router';
import { tabToPath } from '../lib/routes';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  serverStatus: {
    totalRequests: number;
    totalSavedUsd: number;
    activeMode: string;
  };
  onShowLandingPage?: () => void;
  subscription?: SubscriptionState;
  subscriptionPlan?: string;
  workspaceName?: string;
  userEmail?: string;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  serverStatus,
  onShowLandingPage,
  subscription,
  subscriptionPlan = 'Developer',
  workspaceName,
  userEmail,
  onLogout,
}) => {
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Canonical 6 tabs (Entropos-ugg.21)
  const tabs = [
    { id: 'overview', label: 'Inicio' },
    { id: 'mcp', label: 'Conectar' },
    { id: 'history', label: 'Actividad' },
    { id: 'routing', label: 'Enrutamiento' },
    { id: 'providers', label: 'Proveedores' },
    { id: 'pricing', label: 'Plan' },
  ];

  // Include operator tab when active or if accessed
  const allTabs = activeTab === 'operator'
    ? [...tabs, { id: 'operator', label: 'Operador' }]
    : tabs;

  const handleCopyEndpoint = () => {
    const url = window.location.origin + '/mcp';
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const used = subscription?.usedThisMonth ?? 0;
  const quota = subscription?.monthlyQuota ?? 50000;
  const planName = subscription?.planName ?? subscriptionPlan;

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, callback?: () => void) => {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      if (callback) callback();
      setMobileMenuOpen(false);
    }
  };

  const isTabActive = (tabId: string) => {
    if (activeTab === tabId) return true;
    if (tabId === 'routing' && (activeTab === 'mode' || activeTab === 'adaptive' || activeTab === 'flow' || activeTab === 'playground')) {
      return true;
    }
    return false;
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Clean Wordmark + Plan / Quota link */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, onShowLandingPage)}
            className="text-base font-bold tracking-tight text-white hover:text-indigo-400 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Ver Landing Page de Entropos"
          >
            <span className="font-mono text-indigo-400 font-bold">λ</span>
            <span>Entropos</span>
          </a>
          <span className="text-slate-700 hidden sm:inline" aria-hidden="true">/</span>

          {workspaceName && (
            <span
              className="hidden lg:inline px-2 py-0.5 rounded text-[11px] font-mono text-slate-300 bg-slate-900 border border-slate-800 truncate max-w-[140px]"
              title={`Workspace: ${workspaceName}`}
            >
              {workspaceName}
            </span>
          )}

          <a
            href="/app/pricing"
            onClick={(e) => handleLinkClick(e, () => setActiveTab('pricing'))}
            className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-mono bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer group"
            title="Ver Cuota y Plan"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span>{planName}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400 group-hover:text-slate-200 tabular-nums">
              {quota >= 10000000 ? 'Ilimitado' : `${used.toLocaleString()} / ${(quota / 1000).toFixed(0)}k`}
            </span>
          </a>
        </div>

        {/* Zone 2: Desktop 6 Navigation Tabs (md and up) */}
        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-1 py-1"
        >
          {allTabs.map((tab) => {
            const active = isTabActive(tab.id);
            const path = tabToPath(tab.id);
            return (
              <a
                key={tab.id}
                href={path}
                onClick={(e) => handleLinkClick(e, () => setActiveTab(tab.id))}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Actions (Saved USD, Copy MCP, Logout & Mobile Hamburger) */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-400 font-mono px-2 py-1 rounded bg-slate-900/60 border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase">Ahorro</span>
            <span className="text-emerald-400 font-semibold tabular-nums">
              ${serverStatus.totalSavedUsd.toFixed(2)}
            </span>
          </div>

          <button
            onClick={handleCopyEndpoint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm active:scale-95"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Terminal className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'URL Copiada' : 'Copiar URL /mcp'}</span>
            <span className="sm:hidden">{copied ? 'Copiada' : 'MCP'}</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Menu Toggle Button (Visible on < md) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú de navegación'}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg border border-slate-800 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer (Visible when hamburger is open on < md) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800/90 bg-slate-950/95 backdrop-blur-md px-4 py-3 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 px-2 py-1">
            Navegación
          </div>
          <nav className="grid grid-cols-2 gap-1.5">
            {allTabs.map((tab) => {
              const active = isTabActive(tab.id);
              const path = tabToPath(tab.id);
              return (
                <a
                  key={tab.id}
                  href={path}
                  onClick={(e) => handleLinkClick(e, () => setActiveTab(tab.id))}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-center ${
                    active
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                      : 'text-slate-300 hover:text-white bg-slate-900/60 border border-slate-800/80'
                  }`}
                >
                  {tab.label}
                </a>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs font-mono text-slate-400 px-2">
            <span>Ahorro neto: <strong className="text-emerald-400">${serverStatus.totalSavedUsd.toFixed(2)}</strong></span>
            <span>Plan: <strong className="text-indigo-300">{planName}</strong></span>
          </div>
        </div>
      )}
    </header>
  );
};
