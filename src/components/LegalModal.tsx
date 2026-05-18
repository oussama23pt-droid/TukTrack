import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'terms' | 'privacy';
}

export default function LegalModal({ isOpen, onClose, type }: LegalModalProps) {
  const content = {
    terms: {
      title: 'Termos e Condições',
      subtitle: 'Contrato de Utilização do Serviço TukTrack',
      icon: FileText,
      sections: [
        {
          h: '1. Aceitação dos Termos',
          p: 'Ao aceder e utilizar a plataforma TukTrack, o utilizador concorda expressamente em cumprir e ficar vinculado aos presentes Termos e Condições.'
        },
        {
          h: '2. Descrição do Serviço',
          p: 'O TukTrack é uma plataforma de gestão de frotas de tuk-tuks, permitindo o registo de viagens, faturação simbólica e monitorização de desempenho.'
        },
        {
          h: '3. Responsabilidades do Utilizador',
          p: 'O utilizador é responsável por manter a confidencialidade do seu PIN e dados de acesso, bem como pela veracidade dos dados de faturação inseridos.'
        },
        {
          h: '4. Propriedade Intelectual',
          p: 'Todos os direitos sobre a plataforma, software e design pertencem à TukTrack. É proibida qualquer reprodução não autorizada.'
        }
      ]
    },
    privacy: {
      title: 'Política de Privacidade (RGPD)',
      subtitle: 'Proteção de Dados e Conformidade Europeia',
      icon: ShieldCheck,
      sections: [
        {
          h: '1. Recolha de Dados',
          p: 'Recolhemos dados necessários para a operação do serviço, incluindo nome, email, localização do veículo em tempo real e histórico de viagens.'
        },
        {
          h: '2. Finalidade do Processamento',
          p: 'Os dados de localização são processados exclusivamente para fins de segurança operacional e transparência na gestão da frota.'
        },
        {
          h: '3. Seus Direitos (RGPD)',
          p: 'O utilizador tem o direito de aceder, retificar ou solicitar a eliminação dos seus dados pessoais a qualquer momento através das definições da conta.'
        },
        {
          h: '4. Segurança e Retenção',
          p: 'Implementamos medidas técnicas rigorosas para proteger os seus dados. Os dados são retidos enquanto a conta estiver ativa ou conforme exigido por lei.'
        }
      ]
    }
  }[type];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-navy/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-8 pb-4 flex items-start justify-between">
              <div className="flex items-center space-x-4 text-navy">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-amber">
                  <content.icon size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black italic tracking-tight">{content.title}</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{content.subtitle}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-8 pb-8 overflow-y-auto space-y-6">
              <div className="p-4 bg-amber/5 border border-amber/10 rounded-2xl flex items-center space-x-3">
                <CheckCircle2 size={16} className="text-amber" />
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Documento em Vigor • Atualizado em Maio 2024</p>
              </div>

              <div className="space-y-6">
                {content.sections.map((section, i) => (
                  <div key={i} className="space-y-2">
                    <h4 className="text-xs font-black text-navy uppercase tracking-tight">{section.h}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed italic">
                      {section.p}
                    </p>
                  </div>
                ))}
              </div>
              
              <div className="pt-6 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={onClose}
                  className="bg-navy text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-navy-lighter transition-all shadow-lg shadow-navy/20"
                >
                  Li e Compreendo
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
