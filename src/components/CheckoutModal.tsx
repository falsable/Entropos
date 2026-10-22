import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Lock,
  ArrowRight,
  Shield,
  Sparkles,
  Mail,
  Check,
} from 'lucide-react';
import { SubscriptionPlanId, SubscriptionState } from '../types/router';
import { PLANS } from '../constants/plans';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlanId: SubscriptionPlanId;
  onSuccess: (updatedSub: SubscriptionState) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  targetPlanId,
}) => {
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const plan = PLANS[targetPlanId] || PLANS.pro;
  const isFree = targetPlanId === 'developer';

  const handleWaitlistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setSubmitted(true);
    setTimeout(() => {
      onClose();
      setSubmitted(false);
      setWaitlistEmail('');
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-sans">
        {/* Header Strip */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {isFree ? 'Plan Developer' : `Plan ${plan.name} (Próximamente en Cloud)`}
              </h3>
              <p className="text-xs text-slate-400 font-mono">Modo Beta de Acceso Abierto</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Plan Summary Card */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-mono">
                Plan Seleccionado
              </div>
              <div className="text-base font-bold text-white mt-0.5">{plan.name}</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">{plan.quotaDisplay}</div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {plan.priceDisplay}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {isFree ? 'para siempre gratis' : plan.periodDisplay}
              </div>
            </div>
          </div>

          {/* Honest Status Callout */}
          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/50 space-y-2 text-xs leading-relaxed">
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Estado del Servicio: Beta Abierta para Desarrolladores</span>
            </div>
            <p className="text-slate-300">
              Actualmente todas las funciones del motor Entropos (enrutamiento de Shannon, Thompson Sampling, MCP HTTP/SSE, proxy OpenAI <code className="text-indigo-300 font-mono">/v1</code>, claves BYOK y Zero Data Retention) están disponibles sin coste en tu instancia.
            </p>
            {!isFree && (
              <p className="text-slate-400 text-[11px]">
                La suscripción alojada con facturación automática por Stripe está en fase de preparación. Puedes continuar utilizando tu instancia local/equipo con claves de proveedor propias (BYOK).
              </p>
            )}
          </div>

          {/* Waitlist Form or Dismiss Button */}
          {!isFree ? (
            submitted ? (
              <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-emerald-300 text-xs font-mono flex items-center justify-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>¡Gracias! Te avisaremos cuando el plan {plan.name} esté listo.</span>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                <label className="block text-xs font-mono text-slate-300">
                  Únete a la lista de espera para el plan gestionado {plan.name}:
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="email"
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      placeholder="ingenieria@tu-empresa.com"
                      required
                      className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 shadow-sm"
                  >
                    Avisarme
                  </button>
                </div>
              </form>
            )
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Continuar con Plan Developer
              </button>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-slate-600" />
              <span>Sin cobros ocultos ni tarjetas simuladas</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
