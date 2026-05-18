import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'pt' : 'en';
    i18n.changeLanguage(nextLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className={cn(
        "group flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl bg-white/40 border border-white/60 hover:bg-white/60 transition-all duration-300 shadow-sm active:scale-95 backdrop-blur-md shrink-0",
        className
      )}
      title="Switch Language / Mudar Idioma"
    >
      <div className="relative shrink-0">
        <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-navy group-hover:rotate-12 transition-transform duration-500" />
        <div className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-amber rounded-full animate-pulse" />
      </div>
      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-navy">
        {i18n.language.split('-')[0]}
      </span>
    </button>
  );
};
