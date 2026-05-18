import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Shield, Lock, Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 p-6 sm:p-12">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-slate-500 hover:text-navy transition-colors mb-8 group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest">Voltar</span>
        </button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl shadow-slate-200/50 border border-slate-100"
        >
          <div className="flex items-center space-x-4 mb-8">
            <div className="w-16 h-16 bg-amber/10 rounded-3xl flex items-center justify-center text-amber">
              <Shield size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter italic leading-none">Privacidade & Proteção</h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Última atualização: Maio 2026</p>
            </div>
          </div>

          <div className="space-y-12 text-slate-600 leading-relaxed">
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <Lock size={18} className="text-navy" />
                <h2 className="text-lg font-black text-navy uppercase tracking-tight">Compromisso TukTrack</h2>
              </div>
              <p className="text-sm">
                Na TukTrack, a privacidade dos seus dados é o nosso pilar central. Desenvolvemos este sistema com princípios de "Privacidade por Design", garantindo que apenas os dados estritamente necessários para a operação logística são processados.
              </p>
            </section>

            <section>
              <div className="flex items-center space-x-3 mb-4">
                <Eye size={18} className="text-navy" />
                <h2 className="text-lg font-black text-navy uppercase tracking-tight">Que dados recolhemos?</h2>
              </div>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start space-x-3">
                  <div className="w-1.5 h-1.5 bg-amber rounded-full mt-1.5 shrink-0" />
                  <span><strong>Localização em Tempo Real:</strong> Utilizada exclusivamente enquanto o motorista está em serviço para permitir a gestão da frota pelo gestor associado.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-1.5 h-1.5 bg-amber rounded-full mt-1.5 shrink-0" />
                  <span><strong>Registo de Atividades:</strong> Quilometragem, horários de início/fim e transações financeiras (tours) para fins de contabilidade e relatórios.</span>
                </li>
              </ul>
            </section>

            <section>
              <div className="flex items-center space-x-3 mb-4">
                <Trash2 size={18} className="text-red-500" />
                <h2 className="text-lg font-black text-navy uppercase tracking-tight">Direitos de Eliminação</h2>
              </div>
              <p className="text-sm mb-6">
                Qualquer utilizador tem o direito de solicitar a eliminação total dos seus dados dos nossos sistemas em conformidade com o RGPD.
              </p>
              <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                <p className="text-xs text-red-600 font-bold mb-4">Para solicitar a eliminação imediata da sua conta e dados associados:</p>
                <a 
                  href="mailto:suporte@tuktrackapp.com?subject=Pedido de Eliminação de Dados"
                  className="inline-block px-6 py-3 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Solicitar Eliminação via Email
                </a>
              </div>
            </section>
          </div>
        </motion.div>

        <footer className="mt-12 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            TukTrack &copy; 2026 &bull; Lisboa, Portugal
          </p>
        </footer>
      </div>
    </div>
  );
}
