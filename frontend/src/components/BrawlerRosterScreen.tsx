import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown, X, Layers } from 'lucide-react';
import type { Brawler, BrawlerClass } from '../types/brawl';

interface BrawlerRosterScreenProps {
  allBrawlers: Brawler[];
  onInspectBrawler: (brawler: Brawler) => void;
}

type SortMode = 'name' | 'class' | 'rarity' | 'hypercharge';

const CLASS_TABS: { label: string; value: BrawlerClass | 'Todas' }[] = [
  { label: 'Todas', value: 'Todas' },
  { label: 'Tanques', value: 'Tank' },
  { label: 'Asesinos', value: 'Assassin' },
  { label: 'Snipers', value: 'Marksman' },
  { label: 'Control', value: 'Controller' },
  { label: 'Lanzadores', value: 'Artillery' },
  { label: 'Daño', value: 'Damage Dealer' },
  { label: 'Soporte', value: 'Support' },
];

const getRarityNumber = (rarity: string): number => {
  const lower = rarity.toLowerCase();
  if (lower.includes('icon') || lower.includes('ícono')) return 5;
  if (lower.includes('crystal') || lower.includes('cristal')) return 6;
  if (lower.includes('rare') || lower.includes('raro') && !lower.includes('super')) return 2;
  if (lower.includes('super')) return 2;
  if (lower.includes('epic') || lower.includes('mítico')) return 3;
  if (lower.includes('mythic') || lower.includes('leyenda')) return 4;
  if (lower.includes('common') || lower.includes('común')) return 1;
  return 1;
};

/**
 * Tarjeta de brawler dentro del grid del roster.
 * Muestra el modelo cuerpo completo (Fan Kit / Brawlify) con la animación idle flotante
 * (levitación + balanceo) para que el brawler "se vea vivo" en la lista.
 */
const BrawlerGridCard: React.FC<{
  brawler: Brawler;
  onSelect: (brawler: Brawler) => void;
}> = ({ brawler, onSelect }) => {
  const [modelFailed, setModelFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const modelUrl = brawler.modelUrl;
  const iconFallback = brawler.iconUrl;

  return (
    <button
      onClick={() => onSelect(brawler)}
      className="relative flex flex-col items-center p-1.5 rounded-xl border border-slate-800 bg-slate-950/80 hover:border-amber-400 hover:bg-slate-900 active:scale-95 transition-all cursor-pointer overflow-hidden"
    >
      {/* Glow dorado sutil detrás del carácter */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 aspect-square rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(255,200,80,0.22), rgba(255,176,32,0.06) 55%, transparent 70%)',
        }}
      />

      {/* Zona del modelo (cuerpo completo) con idle flotante.
          Fallback: modelo → icono → iniciales. */}
      <div className="relative w-16 h-16 mb-1 flex items-center justify-center">
        {modelUrl && !modelFailed ? (
          <img
            src={modelUrl}
            alt={brawler.displayName}
            className="brawler-hover-sm w-auto h-[86%] max-w-[86%] object-contain select-none pointer-events-none drop-shadow-[0_8px_8px_rgba(0,0,0,0.55)]"
            loading="lazy"
            onError={() => setModelFailed(true)}
          />
        ) : iconFallback && !iconFailed ? (
          <img
            src={iconFallback}
            alt={brawler.displayName}
            className="brawler-hover-sm w-[86%] h-[86%] object-contain select-none pointer-events-none"
            loading="lazy"
            onError={() => setIconFailed(true)}
          />
        ) : (
          /* Placeholder: inicial + clase */
          <div className="w-full h-full rounded-lg bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border border-amber-500/30 flex flex-col items-center justify-center">
            <span className="text-lg font-black text-amber-300 leading-none">
              {brawler.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {brawler.hasHypercharge && (
          <div className="absolute top-0 right-0 w-3 h-3 bg-fuchsia-500 rounded-bl-lg" />
        )}
      </div>

      <span className="text-[10px] font-bold text-slate-200 truncate w-full text-center">
        {brawler.displayName}
      </span>
      <span className="text-[8px] text-slate-500 truncate w-full text-center">
        {brawler.class}
      </span>
      <span className="text-[7.5px] text-slate-600 truncate w-full text-center">
        {brawler.rarity}
      </span>
    </button>
  );
};

export const BrawlerRosterScreen: React.FC<BrawlerRosterScreenProps> = ({
  allBrawlers,
  onInspectBrawler,
}) => {
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<BrawlerClass | 'Todas'>('Todas');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [previewBrawler, setPreviewBrawler] = useState<Brawler | null>(null);

  const toggleSort = (mode: SortMode) => {
    if (sortMode === mode) {
      setSortAsc(!sortAsc);
    } else {
      setSortMode(mode);
      setSortAsc(true);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = allBrawlers;

    // 1. Class filter
    if (selectedClass !== 'Todas') {
      result = result.filter((b) => b.class === selectedClass);
    }

    // 2. Text search (name, class, rarity)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.displayName.toLowerCase().includes(q) ||
          b.class.toLowerCase().includes(q) ||
          b.rarity.toLowerCase().includes(q)
      );
    }

    // 3. Sort
    const sorted = [...result];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortMode) {
        case 'name':
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        case 'class':
          cmp = a.class.localeCompare(b.class);
          break;
        case 'rarity':
          cmp = getRarityNumber(a.rarity) - getRarityNumber(b.rarity);
          break;
        case 'hypercharge':
          cmp = (a.hasHypercharge ? 1 : 0) - (b.hasHypercharge ? 1 : 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [allBrawlers, selectedClass, search, sortMode, sortAsc]);

  const countsByClass = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of allBrawlers) {
      counts[b.class] = (counts[b.class] || 0) + 1;
    }
    return counts;
  }, [allBrawlers]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-white">
            Roster Completo de Brawlers
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">
            ({allBrawlers.length} brawlers)
          </span>
        </div>
        <span className="text-[10px] text-slate-400">
          {filteredAndSorted.length} mostrados
        </span>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, clase o rareza..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-7 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
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

      {/* Class filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
        {CLASS_TABS.map((tab) => {
          const isAll = tab.value === 'Todas';
          const count = isAll ? allBrawlers.length : (countsByClass[tab.value] || 0);
          return (
            <button
              key={tab.value}
              onClick={() => setSelectedClass(tab.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors flex items-center gap-1 ${
                selectedClass === tab.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                  isAll || selectedClass === tab.value
                    ? 'bg-black/30 text-inherit'
                    : 'bg-slate-900 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-semibold text-slate-400 flex items-center gap-1">
          <ArrowUpDown className="w-3 h-3 text-slate-400" />
          Ordenar:
        </span>
        <button
          onClick={() => toggleSort('name')}
          className={`px-2 py-0.5 rounded-lg font-bold transition-colors ${
            sortMode === 'name' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Nombre {sortMode === 'name' && (sortAsc ? '↑' : '↓')}
        </button>
        <button
          onClick={() => toggleSort('class')}
          className={`px-2 py-0.5 rounded-lg font-bold transition-colors ${
            sortMode === 'class' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Clase {sortMode === 'class' && (sortAsc ? '↑' : '↓')}
        </button>
        <button
          onClick={() => toggleSort('rarity')}
          className={`px-2 py-0.5 rounded-lg font-bold transition-colors ${
            sortMode === 'rarity' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Rareza {sortMode === 'rarity' && (sortAsc ? '↑' : '↓')}
        </button>
        <button
          onClick={() => toggleSort('hypercharge')}
          className={`px-2 py-0.5 rounded-lg font-bold transition-colors ${
            sortMode === 'hypercharge' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Hypercharge
        </button>
      </div>

      {/* Brawlers grid — cada tarjeta muestra el modelo cuerpo completo con idle flotante */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
        {filteredAndSorted.length === 0 ? (
          <div className="col-span-full py-8 text-center text-xs text-slate-400">
            No hay brawlers con los filtros actuales.
          </div>
        ) : (
          filteredAndSorted.map((brawler) => (
            <BrawlerGridCard
              key={brawler.id}
              brawler={brawler}
              onSelect={(b) => setPreviewBrawler(b)}
            />
          ))
        )}
      </div>

      {/* Preview animado (modal con idle flotante) */}
      {previewBrawler && (
        <PreviewAnimatedModel
          brawler={previewBrawler}
          onInspectBrawler={(b) => {
            onInspectBrawler(b);
            setPreviewBrawler(null);
          }}
          onClose={() => setPreviewBrawler(null)}
        />
      )}
    </div>
  );
};

/**
 * Preview modal with the large animated model (full-body render from Fan Kit).
 * Fallback chain: full-body model → large icon → initials placeholder.
 */
const PreviewAnimatedModel: React.FC<{
  brawler: Brawler;
  onInspectBrawler: (brawler: Brawler) => void;
  onClose: () => void;
}> = ({ brawler, onInspectBrawler, onClose }) => {
  const [modelFailed, setModelFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const modelUrl = brawler.modelUrl;
  const iconUrl = brawler.iconUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow dorado detrás */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 aspect-square rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(255,200,80,0.45), rgba(255,176,32,0.12) 55%, transparent 72%)',
          }}
        />

        {/* Plataforma que "respira" */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-1/2 h-3 rounded-full bg-cyan-400/20 blur-sm pointer-events-none" />

        {/* Modelo con idle flotante (grande) */}
        <div className="relative h-64 flex items-center justify-center">
          {modelUrl && !modelFailed ? (
            <img
              src={modelUrl}
              alt={brawler.displayName}
              className="brawler-hover w-auto h-full max-w-[85%] object-contain select-none pointer-events-none drop-shadow-[0_16px_16px_rgba(0,0,0,0.6)]"
              onError={() => setModelFailed(true)}
            />
          ) : iconUrl && !iconFailed ? (
            <img
              src={iconUrl}
              alt={brawler.displayName}
              className="brawler-hover w-48 h-48 object-contain select-none pointer-events-none drop-shadow-[0_12px_12px_rgba(0,0,0,0.55)]"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <div className="w-48 h-48 rounded-3xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border-2 border-amber-500/40 flex flex-col items-center justify-center gap-1">
              <span className="text-5xl font-black text-amber-300 leading-none">
                {brawler.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                {brawler.class}
              </span>
            </div>
          )}
        </div>

        {/* Nombre + stats */}
        <div className="text-center mt-2">
          <span
            className="text-xl font-black uppercase tracking-wider"
            style={{
              color: '#ffd75e',
              textShadow: '0 2px 0 #6b4a00, 0 0 18px rgba(255,200,80,0.55)',
            }}
          >
            {brawler.displayName}
          </span>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-slate-300">
            <span className="bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
              {brawler.class}
            </span>
            <span className="bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
              {brawler.rarity}
            </span>
            {brawler.hasHypercharge && (
              <span className="bg-fuchsia-900/50 px-2 py-0.5 rounded-full border border-fuchsia-500/40 text-fuchsia-300">
                ⚡ Hypercharge
              </span>
            )}
          </div>
        </div>

        {/* Botones de acción */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onInspectBrawler(brawler)}
            className="flex-1 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-wide"
          >
            Ver ficha completa
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            Cerrar
          </button>
        </div>

        {/* Botón cerrar (X) arriba a la derecha */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
