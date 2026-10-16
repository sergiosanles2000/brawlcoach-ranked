import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Ban, Shield, Sword } from 'lucide-react';
import type { Brawler, BrawlerClass } from '../types/brawl';
import type { ActiveSlotType } from './DraftSlots';

interface BrawlerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  allBrawlers: Brawler[];
  unavailableNames: Set<string>;
  activeSlot: ActiveSlotType;
  onSelectBrawler: (brawlerName: string) => void;
}

const CLASS_TABS: { label: string; value: BrawlerClass | 'All' }[] = [
  { label: 'Todos', value: 'All' },
  { label: 'Tanques', value: 'Tank' },
  { label: 'Snipers', value: 'Marksman' },
  { label: 'Asesinos', value: 'Assassin' },
  { label: 'Control', value: 'Controller' },
  { label: 'Lanzadores', value: 'Artillery' },
  { label: 'Soporte', value: 'Support' },
];

export const BrawlerPickerModal: React.FC<BrawlerPickerModalProps> = ({
  isOpen,
  onClose,
  allBrawlers,
  unavailableNames,
  activeSlot,
  onSelectBrawler,
}) => {
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<BrawlerClass | 'All'>('All');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredBrawlers = useMemo(() => {
    return allBrawlers.filter((b) => {
      // Class filter
      if (selectedClass !== 'All' && b.class !== selectedClass) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        return (
          b.displayName.toLowerCase().includes(query) ||
          b.class.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [allBrawlers, selectedClass, search]);

  if (!isOpen || !activeSlot) return null;

  const targetDescription =
    activeSlot.type === 'pick'
      ? activeSlot.team === 'ally'
        ? `Pick ${activeSlot.index + 1} Aliado`
        : `Pick ${activeSlot.index + 1} Rival`
      : activeSlot.team === 'ally'
      ? `Baneo ${activeSlot.index + 1} Aliado`
      : `Baneo ${activeSlot.index + 1} Rival`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
      {/* Modal Card / Bottom Sheet */}
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeSlot.type === 'ban' ? (
              <div className="w-7 h-7 rounded-lg bg-red-950/60 border border-red-700/60 flex items-center justify-center text-red-400">
                <Ban className="w-4 h-4" />
              </div>
            ) : activeSlot.team === 'ally' ? (
              <div className="w-7 h-7 rounded-lg bg-blue-950/60 border border-blue-700/60 flex items-center justify-center text-blue-400">
                <Shield className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-lg bg-red-950/60 border border-red-700/60 flex items-center justify-center text-red-400">
                <Sword className="w-4 h-4" />
              </div>
            )}

            <div>
              <span className="text-xs font-black uppercase text-slate-100">
                Seleccionar para {targetDescription}
              </span>
              <p className="text-[10px] text-slate-400">Toca para asignar al instante</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-2.5 border-b border-slate-800 flex flex-col gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar brawler por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Role tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
            {CLASS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSelectedClass(tab.value)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors ${
                  selectedClass === tab.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Brawler Grid */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-4 sm:grid-cols-5 gap-2">
          {filteredBrawlers.map((brawler) => {
            const isUnavailable = unavailableNames.has(brawler.displayName);

            return (
              <button
                key={brawler.displayName}
                disabled={isUnavailable}
                onClick={() => {
                  onSelectBrawler(brawler.displayName);
                  onClose();
                }}
                className={`relative flex flex-col items-center p-1.5 rounded-xl border transition-all text-center select-none ${
                  isUnavailable
                    ? 'opacity-30 grayscale cursor-not-allowed border-slate-800 bg-slate-950'
                    : 'cursor-pointer hover:border-blue-400 hover:bg-slate-800 active:scale-95 border-slate-800 bg-slate-950/80 shadow-sm'
                }`}
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-800 mb-1">
                  <img
                    src={brawler.iconUrl}
                    alt={brawler.displayName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {brawler.hasHypercharge && (
                    <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-fuchsia-500 rounded-bl-sm" />
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-200 truncate w-full">
                  {brawler.displayName}
                </span>
                <span className="text-[8px] text-slate-500 truncate w-full">
                  {brawler.class}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
