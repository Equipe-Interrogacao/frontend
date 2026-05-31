import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import logoMark from './static/logostratos.png';
import { AppSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from './config/appSettings';

// ─── Types ───────────────────────────────────────────────────────────────────

type ThemeMode = 'light' | 'dark';
type ChatRole = 'incoming' | 'outgoing';
type DbStatus = 'checking' | 'available' | 'unavailable';
type ToastType = 'success' | 'error' | 'warning' | 'info';

type ChatMessage = { id: number; role: ChatRole; text: string };
type Toast = { id: number; type: ToastType; title: string; message?: string };

type PropriedadeBackend = {
  id: number;
  cod_imovel: string;
  status_imovel?: string;
  dat_criacao?: string;
  area?: number;
  condicao?: string;
  uf?: string;
  municipio?: string;
  cod_municipio_ibge?: string;
  m_fiscal?: string;
  tipo_imovel?: string;
  ingerido_em?: string;
  geometria?: { type: string; coordinates: unknown };
};

type AnaliseASG = {
  id: number;
  cod_car: string;
  area_desmatada_ha?: number;
  deficit_app_ha?: number;
  deficit_reserva_legal_ha?: number;
  sobreposicao_uc?: string;
  sobreposicao_ti?: string;
};

type InpeStats = {
  prodes: number;
  prodes_area_ha: number;
  deter: number;
  focos: number;
};

type SobreposicaoProdes = {
  n_poligonos: number;
  area_ha: number;
  por_ano: { ano: number; area_ha: number }[];
};

type ResumoASGConsolidado = {
  indice_risco: number;
  nivel: 'baixo' | 'medio' | 'alto';
  desmatamento_relativo?: number | null;
};

type AreasProtegidasStats = {
  uc: { cod_uc: string; nome?: string }[];
  ti: { cod_ti: string; nome?: string; etnia?: string }[];
  assentamento: { cod_sipra: string; nome?: string }[];
  quilombola: { cod_quilombola: string; nome?: string }[];
};

type IndicadorASG = {
  categoria: string;
  nome: string;
  fonte: string;
  data_referencia: string;
  valor?: number | null;
  unidade?: string | null;
  status: 'ok' | 'atencao' | 'critico' | 'pendente';
  detalhe?: string | null;
};

type RelatorioASG = {
  cod_imovel: string;
  municipio?: string;
  uf?: string;
  area_ha?: number;
  status_car?: string;
  gerado_em: string;
  indicadores: IndicadorASG[];
};

type InpeFeature = {
  id: number;
  geometria?: { type: string; coordinates: unknown };
  [key: string]: unknown;
};

type FonteId = 'sicar' | 'prodes' | 'deter' | 'queimadas' | 'ucs' | 'tis' | 'assentamentos' | 'quilombolas';

type FonteAtualizacao = {
  id: FonteId;
  nome: string;
  status: 'checking' | 'up-to-date' | 'update-available' | 'updating' | 'error';
  ultima_atualizacao?: string;
  total_registros?: number;
  progresso?: number;
};

const FONTES_INICIAIS: FonteAtualizacao[] = [
  { id: 'sicar', nome: 'SICAR', status: 'checking' },
  { id: 'prodes', nome: 'PRODES', status: 'checking' },
  { id: 'deter', nome: 'DETER', status: 'checking' },
  { id: 'queimadas', nome: 'Queimadas', status: 'checking' },
  { id: 'ucs', nome: 'Unidades de Conservação', status: 'checking' },
  { id: 'tis', nome: 'Terras Indígenas', status: 'checking' },
  { id: 'assentamentos', nome: 'Assentamentos', status: 'checking' },
  { id: 'quilombolas', nome: 'Quilombolas', status: 'checking' },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const THEME_KEY = 'stratos-theme';
const HEALTH_URL = '/gerenciamento_banco/health';

// ─── Toast Icons ─────────────────────────────────────────────────────────────

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') return (
    <svg viewBox="0 0 24 24" className="toast-icon"><circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  if (type === 'error') return (
    <svg viewBox="0 0 24 24" className="toast-icon"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" /></svg>
  );
  if (type === 'warning') return (
    <svg viewBox="0 0 24 24" className="toast-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" /><circle cx="12" cy="17" r="0.5" /></svg>
  );
  return (
    <svg viewBox="0 0 24 24" className="toast-icon"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" /><circle cx="12" cy="16" r="0.5" /></svg>
  );
}

// ─── Toast Container ──────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="alert">
          <div className="toast-icon-wrap">
            <ToastIcon type={t.type} />
          </div>
          <div className="toast-body">
            <span className="toast-title">{t.title}</span>
            {t.message && <span className="toast-message">{t.message}</span>}
          </div>
          <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Fechar">
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
          <div className="toast-progress" />
        </div>
      ))}
    </div>
  );
}

// ─── CAR Status Badge ────────────────────────────────────────────────────────

const CAR_STATUS_MAP: Record<string, { label: string; variant: string; description: string }> = {
  AT: { label: 'ATIVO',      variant: 'active',    description: 'Cadastro regular e ativo.' },
  PE: { label: 'PENDENTE',   variant: 'pending',   description: 'Há declarações incorretas ou irregularidades que precisam ser corrigidas.' },
  SU: { label: 'SUSPENSO',   variant: 'suspended', description: 'Cadastro suspenso por decisão judicial ou administrativa.' },
  CA: { label: 'CANCELADO',  variant: 'cancelled', description: 'Cadastro cancelado por informações falsas ou não cumprimento das obrigações.' },
};

function CarStatusBadge({ status }: { status: string }) {
  const info = CAR_STATUS_MAP[status.toUpperCase()] ?? {
    label: status, variant: 'unknown', description: 'Status não reconhecido.'
  };
  return (
    <div className={`car-status-badge car-status-${info.variant}`}>
      <span className="car-status-icon" aria-hidden="true">
        {info.variant === 'active'    && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {info.variant === 'pending'   && <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round"/><circle cx="12" cy="17" r="0.5"/></svg>}
        {info.variant === 'suspended' && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round"/><circle cx="12" cy="16" r="0.5"/></svg>}
        {info.variant === 'cancelled' && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round"/></svg>}
        {info.variant === 'unknown'   && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round"/><circle cx="12" cy="16" r="0.5"/></svg>}
      </span>
      <div className="car-status-body">
        <span className="car-status-label">CAR: {info.label}</span>
        <span className="car-status-desc">{info.description}</span>
      </div>
    </div>
  );
}

// ─── Chat text renderer ───────────────────────────────────────────────────────

const _CHAT_COLORS: Array<[RegExp, string]> = [
  [/\bPRODES\b/i,                               '#d97706'],
  [/\bDETER\b/i,                                '#dc2626'],
  [/\bqueimad|foco.*(calor|queimada)/i,          '#f59e0b'],
  [/\bUC\b|unidade.*conserv/i,                  '#059669'],
  [/\bTI\b|terra.*ind[ií]gen|ind[ií]gena/i,     '#7c3aed'],
  [/\bassentamento/i,                            '#b45309'],
  [/\bquilombola/i,                              '#be185d'],
  [/\bbaixo\b/i,                                '#16a34a'],
  [/\bmoderado\b|m[eé]dio\b/i,                  '#d97706'],
  [/\balto\b/i,                                 '#dc2626'],
];

const _CAR_SPLIT_RE = /((?:[A-Z]{2}-[A-Za-z0-9]{7}-[A-Za-z0-9]+))/gi;

function _chatColorFor(word: string): string | null {
  for (const [re, color] of _CHAT_COLORS) {
    if (re.test(word)) return color;
  }
  return null;
}

// SP-3549904-93C7761B1292455C8CEF330F14 → SP-3549904-93C776…F14
function _shortCar(car: string): string {
  const parts = car.split('-');
  if (parts.length < 3) return car;
  const hash = parts.slice(2).join('-');
  if (hash.length <= 10) return car;
  return `${parts[0]}-${parts[1]}-${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function renderChatText(text: string, onCarClick?: (car: string) => void): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.flatMap((line, lineIdx) => {
    const boldParts = line.split(/\*\*(.+?)\*\*/g);
    const rendered = (
      <span key={lineIdx * 2}>
        {boldParts.map((seg, j) => {
          if (j % 2 === 1) {
            // bold — check if it's a bare CAR code (render as inline clickable)
            if (onCarClick && /^[A-Z]{2}-[A-Za-z0-9]{7}-[A-Za-z0-9]+$/i.test(seg)) {
              return (
                <span key={j} className="chat-car-btn" role="button" tabIndex={0}
                  onClick={() => onCarClick(seg.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && onCarClick(seg.toUpperCase())}>
                  {seg.toUpperCase()}
                </span>
              );
            }
            return <strong key={j} style={{ color: _chatColorFor(seg) ?? undefined }}>{seg}</strong>;
          }
          if (!seg) return null;
          // plain text — split on bare CAR codes too
          const carParts = seg.split(_CAR_SPLIT_RE);
          if (carParts.length === 1) return <span key={j}>{seg}</span>;
          return carParts.map((part, k) =>
            k % 2 === 1 && onCarClick
              ? <span key={`${j}-${k}`} className="chat-car-btn" role="button" tabIndex={0}
                  onClick={() => onCarClick(part.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && onCarClick(part.toUpperCase())}
                  >{part.toUpperCase()}</span>
              : part ? <span key={`${j}-${k}`}>{part}</span> : null
          );
        })}
      </span>
    );
    return lineIdx < lines.length - 1
      ? [rendered, <br key={lineIdx * 2 + 1} />]
      : [rendered];
  });
}

// ─── Chat suggestions ─────────────────────────────────────────────────────────

function getSuggestions(
  intencao: string | undefined,
  hasProperty: boolean,
  municipio?: string,
): string[] {
  const m = municipio;

  // Com propriedade carregada — sugestões complementares específicas
  if (hasProperty) {
    const map: Record<string, string[]> = {
      queimada:     ['Desmatamento PRODES', 'Alertas DETER', 'Relatório ASG'],
      desmatamento: ['Queimadas', 'Alertas DETER', 'Relatório ASG'],
      alerta:       ['Desmatamento PRODES', 'Queimadas', 'Relatório ASG'],
      indigena:     ['Unidades de Conservação', 'Assentamentos', 'Relatório ASG'],
      conservacao:  ['Terras Indígenas', 'Assentamentos', 'Relatório ASG'],
      comunidades:  ['Terras Indígenas', 'Unidades de Conservação', 'Relatório ASG'],
      relatorio:    ['Queimadas', 'Desmatamento PRODES', 'Terras Indígenas'],
      governanca:   ['Relatório ASG', 'Dados fundiários', 'Queimadas'],
      fundiario:    ['Relatório ASG', 'Queimadas', 'Desmatamento PRODES'],
    };
    return map[intencao ?? ''] ?? ['Relatório ASG', 'Queimadas', 'Desmatamento PRODES'];
  }

  // Com município no contexto — sugestões cruzadas no mesmo município
  if (m) {
    const cross: Record<string, string[]> = {
      queimada:     [`Desmatamento em ${m}`, `Terras Indígenas em ${m}`, 'Cidades com mais queimadas'],
      desmatamento: [`Queimadas em ${m}`, `Alertas DETER em ${m}`, 'Cidades com mais desmatamento'],
      alerta:       [`Desmatamento em ${m}`, `Queimadas em ${m}`, 'Cidades com mais alertas'],
      indigena:     [`UCs em ${m}`, `Assentamentos em ${m}`, `Queimadas em ${m}`],
      conservacao:  [`Terras Indígenas em ${m}`, `Queimadas em ${m}`, `Desmatamento em ${m}`],
      comunidades:  [`Terras Indígenas em ${m}`, `UCs em ${m}`, `Queimadas em ${m}`],
      relatorio:    [`Queimadas em ${m}`, `Desmatamento em ${m}`, 'Cidades com mais focos'],
      governanca:   [`Relatório ASG em ${m}`, `Queimadas em ${m}`],
      fundiario:    [`Relatório ASG em ${m}`, `Queimadas em ${m}`],
    };
    return cross[intencao ?? ''] ?? [`Queimadas em ${m}`, `Desmatamento em ${m}`, 'Relatório ASG'];
  }

  // Sem contexto — sugestões gerais de exploração
  const general: Record<string, string[]> = {
    queimada:     ['Cidades com mais queimadas', 'Desmatamento em SP', 'Queimadas em Campinas'],
    desmatamento: ['Cidades com mais desmatamento', 'Queimadas em SP', 'TI em SP'],
    alerta:       ['Cidades com mais alertas DETER', 'Desmatamento em SP', 'Queimadas em SP'],
    indigena:     ['TI em SP', 'UCs em SP', 'Cidades com mais desmatamento'],
    conservacao:  ['UCs em SP', 'Terras indígenas em SP', 'Queimadas em SP'],
    comunidades:  ['Assentamentos em SP', 'Queimadas em SP', 'Desmatamento em SP'],
    relatorio:    ['Cidades com mais queimadas', 'Maior desmatamento SP', 'TI em SP'],
    governanca:   ['Relatório ASG', 'Queimadas em SP'],
    fundiario:    ['Relatório ASG', 'Queimadas em SP'],
  };
  return general[intencao ?? ''] ?? ['Cidades com mais queimadas', 'Maior desmatamento SP', 'Relatório ASG'];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitialTheme(): ThemeMode {
  const s = localStorage.getItem(THEME_KEY);
  return s === 'dark' ? 'dark' : 'light';
}

function parseCoordinates(input: string): [number, number] | null {
  const m = input.trim().match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [rightPanel, setRightPanel] = useState<'both' | 'report-only' | 'chat-only'>('both');
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [propriedade, setPropriedade] = useState<PropriedadeBackend | null>(null);
  const [analiseASG, setAnaliseASG] = useState<AnaliseASG | null>(null);
  const [relatorioASG, setRelatorioASG] = useState<RelatorioASG | null>(null);
  const [resumoASG, setResumoASG] = useState<ResumoASGConsolidado | null>(null);
  const [inpeStats, setInpeStats] = useState<InpeStats | null>(null);
  const [sobreposicaoProdes, setSobreposicaoProdes] = useState<SobreposicaoProdes | null>(null);
  const [areasProtegidasStats, setAreasProtegidasStats] = useState<AreasProtegidasStats | null>(null);
  const [filtroAno, setFiltroAno] = useState<number | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus>('checking');
  const [dbMessage, setDbMessage] = useState('Verificando banco...');
  const [inpeProdesCount, setInpeProdesCount] = useState<number | null>(null);
  const [inpeDeterCount, setInpeDeterCount] = useState<number | null>(null);
  const [inpeFocosCount, setInpeFocosCount] = useState<number | null>(null);
  const [ucCount, setUcCount] = useState<number | null>(null);
  const [tiCount, setTiCount] = useState<number | null>(null);
  const [assentamentoCount, setAssentamentoCount] = useState<number | null>(null);
  const [quilombolaCount, setQuilombolaCount] = useState<number | null>(null);
  const [propriedadesCount, setPropriedadesCount] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'incoming', text: 'Olá! Pergunte sobre desmatamento, queimadas, terras indígenas, UCs, assentamentos ou envie coordenadas (ex: -23.5, -46.6). Para análise de uma propriedade específica, informe o código CAR.' }
  ]);
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([
    'Cidades com mais queimadas', 'Maior desmatamento SP', 'Relatório ASG',
  ]);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const chatActivatedLayersRef = useRef<LayerId[]>([]);
  const chatContextRef = useRef<{ municipio?: string; intencao?: string }>({});
  const propriedadeViaChat = useRef<boolean>(false);
  const propriedadeRef = useRef<PropriedadeBackend | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const resultLayerRef = useRef<L.FeatureGroup | null>(null);
  const neighborsLayerRef = useRef<L.LayerGroup | null>(null);
  const prodesLayerRef = useRef<L.LayerGroup | null>(null);
  const deterLayerRef = useRef<L.LayerGroup | null>(null);
  const focosLayerRef = useRef<L.LayerGroup | null>(null);
  const ucLayerRef = useRef<L.LayerGroup | null>(null);
  const tiLayerRef = useRef<L.LayerGroup | null>(null);
  const assentamentoLayerRef = useRef<L.LayerGroup | null>(null);
  const quilombolaLayerRef = useRef<L.LayerGroup | null>(null);
  const propriedadesLayerRef = useRef<L.LayerGroup | null>(null);
  const propriedadesActiveRef = useRef(false);
  const carregarPropriedadesRef = useRef<(() => Promise<void>) | null>(null);

  // Auth & Admin States
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<'ingestao' | 'settings'>('ingestao');
  const [tempSettings, setTempSettings] = useState<AppSettings>(appSettings);
  const [fontesAdmin, setFontesAdmin] = useState<FonteAtualizacao[]>(FONTES_INICIAIS);

  type LayerId = 'prodes' | 'deter' | 'queimadas' | 'uc' | 'ti' | 'assentamento' | 'quilombola' | 'propriedades';
  const _initLayers: Record<LayerId, boolean> = {
    prodes: false, deter: false, queimadas: false,
    uc: false, ti: false, assentamento: false, quilombola: false, propriedades: false,
  };
  const [layerVisible, setLayerVisible] = useState<Record<LayerId, boolean>>(_initLayers);
  const layerVisibleRef = useRef<Record<LayerId, boolean>>({ ..._initLayers });
  const layerLoadingRef = useRef<Record<LayerId, boolean>>({ ..._initLayers });
  const [, forceLayerLoadingRender] = useState(0);

  // Reset temp settings when opening the modal
  useEffect(() => {
    if (isModalOpen) setTempSettings(appSettings);
  }, [isModalOpen, appSettings]);

  // Toast helpers
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), appSettings.toastDurationMs);
  }, [appSettings.toastDurationMs]);

  const toggleRightPanel = useCallback((which: 'report' | 'chat') => {
    setRightPanel((prev) => {
      if (which === 'report') return prev === 'report-only' ? 'both' : 'report-only';
      return prev === 'chat-only' ? 'both' : 'chat-only';
    });
  }, []);

  // Favicon
  useEffect(() => {
    let fav = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!fav) { fav = document.createElement('link'); fav.rel = 'icon'; document.head.appendChild(fav); }
    fav.href = logoMark;
  }, []);

  // Health check
  useEffect(() => {
    let active = true;
    const ctrl = new AbortController();
    fetch(HEALTH_URL, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const p = await r.json() as Record<string, unknown>;
        if (!active) return;
        if (p['sicarSpDisponivel'] === true) {
          setDbStatus('available');
          setDbMessage(`SICAR: ${String(p['total_sp'] ?? p['total'] ?? '?')} propriedades SP.`);
        } else {
          setDbStatus('unavailable');
          setDbMessage('Sem cache SP — busca ingere sob demanda.');
        }
        if (typeof p['total_prodes'] === 'number') setInpeProdesCount(p['total_prodes']);
        if (typeof p['total_deter'] === 'number') setInpeDeterCount(p['total_deter']);
        if (typeof p['total_focos'] === 'number') setInpeFocosCount(p['total_focos']);
        if (typeof p['total_uc'] === 'number') setUcCount(p['total_uc']);
        if (typeof p['total_ti'] === 'number') setTiCount(p['total_ti']);
        if (typeof p['total_assentamento'] === 'number') setAssentamentoCount(p['total_assentamento']);
        if (typeof p['total_quilombola'] === 'number') setQuilombolaCount(p['total_quilombola']);
        if (typeof p['total_sp'] === 'number') setPropriedadesCount(p['total_sp']);
        else if (typeof p['total'] === 'number') setPropriedadesCount(p['total']);
      })
      .catch(() => {
        if (!active) return;
        setDbStatus('unavailable');
        setDbMessage('Não foi possível conectar ao banco.');
      });
    return () => { active = false; ctrl.abort(); };
  }, []);

  // Tema
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Fecha menu ao clicar fora / ESC
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setIsThemeMenuOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsThemeMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onEsc); };
  }, []);

  // Mapa
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { 
      center: [appSettings.mapCenterLat, appSettings.mapCenterLng], 
      zoom: appSettings.mapZoom, 
      zoomControl: false 
    });
    mapRef.current = map;
    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    prodesLayerRef.current = L.layerGroup().addTo(map);
    deterLayerRef.current = L.layerGroup().addTo(map);
    focosLayerRef.current = L.layerGroup().addTo(map);
    ucLayerRef.current = L.layerGroup().addTo(map);
    tiLayerRef.current = L.layerGroup().addTo(map);
    assentamentoLayerRef.current = L.layerGroup().addTo(map);
    quilombolaLayerRef.current = L.layerGroup().addTo(map);
    propriedadesLayerRef.current = L.layerGroup().addTo(map);
    neighborsLayerRef.current = L.layerGroup().addTo(map);
    resultLayerRef.current = L.featureGroup().addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('moveend zoomend', () => {
      if (propriedadesActiveRef.current && carregarPropriedadesRef.current) {
        void carregarPropriedadesRef.current();
      }
    });
    return () => { map.remove(); mapRef.current = null; tileLayerRef.current = null; resultLayerRef.current = null; neighborsLayerRef.current = null; prodesLayerRef.current = null; deterLayerRef.current = null; focosLayerRef.current = null; ucLayerRef.current = null; tiLayerRef.current = null; assentamentoLayerRef.current = null; quilombolaLayerRef.current = null; propriedadesLayerRef.current = null; };
  }, []);

  // Tile ao mudar tema
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    mapRef.current.removeLayer(tileLayerRef.current);
    const next = theme === 'dark'
      ? L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' })
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    next.addTo(mapRef.current);
    tileLayerRef.current = next;
  }, [theme]);

  // Carrega overlays INPE usando queries espaciais (ST_Intersects / ST_DWithin)
  const carregarInpe = useCallback(async (codImovel: string) => {
    prodesLayerRef.current?.clearLayers();
    deterLayerRef.current?.clearLayers();
    focosLayerRef.current?.clearLayers();
    setInpeStats(null);
    setSobreposicaoProdes(null);

    // Sobreposição PRODES — área real de interseção via ST_Intersection + ST_Area(geography)
    void (async () => {
      try {
        const r = await fetch(
          `/gerenciamento_banco/banco/desmatamento-prodes/sobreposicao/${encodeURIComponent(codImovel)}`
        );
        if (!r.ok) return;
        setSobreposicaoProdes(await r.json() as SobreposicaoProdes);
      } catch { /* silently ignore */ }
    })();

    // PRODES — ST_Intersects com a propriedade (laranja)
    void (async () => {
      try {
        const r = await fetch(
          `/gerenciamento_banco/banco/desmatamento-prodes/por-propriedade/${encodeURIComponent(codImovel)}`
        );
        if (!r.ok) return;
        const list = await r.json() as InpeFeature[];
        const layer = prodesLayerRef.current;
        if (!layer) return;
        let totalHa = 0;
        for (const p of list) {
          if (!p.geometria) continue;
          totalHa += ((p['area_km2'] as number) ?? 0) * 100;
          L.geoJSON(p.geometria as GeoJSON.Geometry, {
            style: { color: '#d97706', weight: 1.5, fillColor: '#fbbf24', fillOpacity: 0.35 }
          }).bindTooltip(
            `PRODES ${p['ano'] ?? ''} · ${p['area_km2'] != null ? `${(p['area_km2'] as number).toFixed(2)} km²` : ''}`,
            { sticky: true, opacity: 0.9 }
          ).addTo(layer);
        }
        setInpeStats((s) => ({ ...(s ?? { prodes: 0, prodes_area_ha: 0, deter: 0, focos: 0 }), prodes: list.length, prodes_area_ha: Math.round(totalHa) }));
        if (list.length > 0) addToast('warning', `PRODES: ${list.length} polígono(s) na propriedade`, `~${Math.round(totalHa)} ha desmatados`);
      } catch { /* silently ignore */ }
    })();

    // DETER — ST_Intersects com a propriedade (vermelho)
    void (async () => {
      try {
        const r = await fetch(
          `/gerenciamento_banco/banco/alerta-deter/por-propriedade/${encodeURIComponent(codImovel)}`
        );
        if (!r.ok) return;
        const list = await r.json() as InpeFeature[];
        const layer = deterLayerRef.current;
        if (!layer) return;
        for (const d of list) {
          if (!d.geometria) continue;
          L.geoJSON(d.geometria as GeoJSON.Geometry, {
            style: { color: '#dc2626', weight: 1.5, fillColor: '#f87171', fillOpacity: 0.4 }
          }).bindTooltip(`DETER · ${d['classname'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(layer);
        }
        setInpeStats((s) => ({ ...(s ?? { prodes: 0, prodes_area_ha: 0, deter: 0, focos: 0 }), deter: list.length }));
        if (list.length > 0) addToast('error', `DETER: ${list.length} alerta(s) na propriedade`, 'Sobreposição direta detectada');
      } catch { /* silently ignore */ }
    })();

    // Focos — ST_DWithin usando raio dinâmico via Settings
    void (async () => {
      try {
        const r = await fetch(
          `/gerenciamento_banco/banco/foco-queimada/por-propriedade/${encodeURIComponent(codImovel)}?buffer_m=${appSettings.queimadasBufferM}`
        );
        if (!r.ok) return;
        const list = await r.json() as InpeFeature[];
        const layer = focosLayerRef.current;
        if (!layer) return;
        for (const f of list) {
          const lat = f['latitude'] as number | undefined;
          const lon = f['longitude'] as number | undefined;
          if (lat == null || lon == null) continue;
          L.circleMarker([lat, lon], {
            radius: 4, color: '#92400e', weight: 1,
            fillColor: '#f59e0b', fillOpacity: 0.75
          }).bindTooltip(
            `Foco · ${f['satelite'] ?? ''} · ${f['data_hora_gmt'] ? new Date(f['data_hora_gmt'] as string).toLocaleDateString('pt-BR') : ''}`,
            { sticky: true, opacity: 0.9 }
          ).addTo(layer);
        }
        setInpeStats((s) => ({ ...(s ?? { prodes: 0, prodes_area_ha: 0, deter: 0, focos: 0 }), focos: list.length }));
        if (list.length > 0) addToast('warning', `Queimadas: ${list.length} foco(s) (raio ${appSettings.queimadasBufferM/1000} km)`, 'Detectados 2016–2025');
      } catch { /* silently ignore */ }
    })();
  }, [addToast, appSettings.queimadasBufferM]);

  const carregarCamada = useCallback(async (id: LayerId) => {
    const layerMap: Partial<Record<LayerId, React.MutableRefObject<L.LayerGroup | null>>> = {
      prodes: prodesLayerRef, deter: deterLayerRef, queimadas: focosLayerRef,
      uc: ucLayerRef, ti: tiLayerRef, assentamento: assentamentoLayerRef, quilombola: quilombolaLayerRef,
    };
    const layer = layerMap[id]?.current;
    if (!layer) return;
    if (layerLoadingRef.current[id]) return;
    layerLoadingRef.current[id] = true;
    forceLayerLoadingRender((v) => v + 1);
    layer.clearLayers();

    const anoParam = filtroAno ? `&ano=${filtroAno}` : '';
    const configs: Record<LayerId, { url: string; render: (f: InpeFeature, layer: L.LayerGroup) => void }> = {
      prodes: {
        url: `/gerenciamento_banco/banco/desmatamento-prodes?uf=SP&limit=${appSettings.prodesLimit}${anoParam}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#d97706', weight: 1, fillColor: '#fbbf24', fillOpacity: 0.3 }
          }).bindTooltip(`PRODES ${f['ano'] ?? ''} · ${f['area_km2'] != null ? `${(f['area_km2'] as number).toFixed(2)} km²` : ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      deter: {
        url: `/gerenciamento_banco/banco/alerta-deter?uf=SP&limit=${appSettings.deterLimit}${anoParam}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#dc2626', weight: 1, fillColor: '#f87171', fillOpacity: 0.35 }
          }).bindTooltip(`DETER · ${f['classname'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      queimadas: {
        url: `/gerenciamento_banco/banco/foco-queimada?estado=SP&limit=${appSettings.queimadasLimit}`,
        render: (f, l) => {
          const lat = f['latitude'] as number | undefined;
          const lon = f['longitude'] as number | undefined;
          if (lat == null || lon == null) return;
          L.circleMarker([lat, lon], { radius: 3, color: '#92400e', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.7 })
            .bindTooltip(`Foco · ${f['satelite'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      uc: {
        url: `/gerenciamento_banco/banco/unidade-conservacao?uf=SP&limit=${appSettings.areasProtegidasLimit}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#059669', weight: 1.5, fillColor: '#34d399', fillOpacity: 0.3 }
          }).bindTooltip(`UC: ${f['nome'] ?? f['cod_uc'] ?? ''} · ${f['categoria'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      ti: {
        url: `/gerenciamento_banco/banco/terra-indigena?uf=SP&limit=${appSettings.areasProtegidasLimit}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#7c3aed', weight: 1.5, fillColor: '#a78bfa', fillOpacity: 0.35 }
          }).bindTooltip(`TI: ${f['nome'] ?? f['cod_ti'] ?? ''} · ${f['etnia'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      assentamento: {
        url: `/gerenciamento_banco/banco/assentamento?uf=SP&limit=${appSettings.areasProtegidasLimit}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#b45309', weight: 1.5, fillColor: '#fcd34d', fillOpacity: 0.3 }
          }).bindTooltip(`Assentamento: ${f['nome'] ?? f['cod_sipra'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      quilombola: {
        url: `/gerenciamento_banco/banco/quilombola?uf=SP&limit=${appSettings.areasProtegidasLimit}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#be185d', weight: 1.5, fillColor: '#f472b6', fillOpacity: 0.3 }
          }).bindTooltip(`Quilombola: ${f['nome'] ?? f['cod_quilombola'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
    };

    try {
      const r = await fetch(configs[id].url);
      if (!r.ok) return;
      const list = await r.json() as InpeFeature[];
      for (const f of list) configs[id].render(f, layer);
    } catch { /* silently ignore */ } finally {
      layerLoadingRef.current[id] = false;
      forceLayerLoadingRender((v) => v + 1);
    }
  }, [filtroAno, appSettings]);

  const carregarPropriedadesViewport = useCallback(async () => {
    const map = mapRef.current;
    const layer = propriedadesLayerRef.current;
    if (!map || !layer || !propriedadesActiveRef.current) return;
    if (layerLoadingRef.current['propriedades']) return;
    layerLoadingRef.current['propriedades'] = true;
    forceLayerLoadingRender((v) => v + 1);
    layer.clearLayers();
    const zoom = map.getZoom();
    if (zoom < 11) {
      layerLoadingRef.current['propriedades'] = false;
      forceLayerLoadingRender((v) => v + 1);
      return;
    }
    const b = map.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    try {
      const r = await fetch(`/gerenciamento_banco/banco/propriedades?bbox=${bbox}&limit=500`);
      if (!r.ok || !propriedadesActiveRef.current) return;
      const list = await r.json() as PropriedadeBackend[];
      if (!propriedadesActiveRef.current) return;
      layer.clearLayers();
      for (const f of list) {
        if (!f.geometria) continue;
        const cod = f.cod_imovel;
        const popupHtml = `<div style="display:flex;align-items:center;gap:8px;padding:2px 0;max-width:340px">
          <span style="font-family:monospace;font-size:11px;word-break:break-all;flex:1">${cod}</span>
          <button class="sicar-copy-btn" title="Copiar código" style="background:none;border:1px solid #aaa;border-radius:4px;cursor:pointer;padding:4px 6px;display:flex;align-items:center;flex-shrink:0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>`;
        const geoLayer = L.geoJSON(f.geometria as GeoJSON.Geometry, {
          style: { color: '#0891b2', weight: 1, fillColor: '#22d3ee', fillOpacity: 0.15, dashArray: '4 3' }
        }).bindPopup(popupHtml, { maxWidth: 400 });
        geoLayer.on('popupopen', (e) => {
          const popup = (e as L.PopupEvent).popup.getElement();
          popup?.querySelector('.sicar-copy-btn')?.addEventListener('click', () => {
            void navigator.clipboard.writeText(cod);
            addToast('success', 'Código SICAR copiado!', cod);
          });
        });
        geoLayer.addTo(layer);
      }
    } catch { /* ignore */ } finally {
      layerLoadingRef.current['propriedades'] = false;
      forceLayerLoadingRender((v) => v + 1);
    }
  }, [addToast]);

  carregarPropriedadesRef.current = carregarPropriedadesViewport;

  const toggleCamada = useCallback(async (id: LayerId) => {
    const isOn = !layerVisibleRef.current[id];
    layerVisibleRef.current = { ...layerVisibleRef.current, [id]: isOn };
    setLayerVisible(prev => ({ ...prev, [id]: isOn }));

    if (id === 'propriedades') {
      propriedadesActiveRef.current = isOn;
      if (!isOn) { propriedadesLayerRef.current?.clearLayers(); return; }
      await carregarPropriedadesViewport();
      return;
    }

    const layerMap: Record<Exclude<LayerId, 'propriedades'>, React.MutableRefObject<L.LayerGroup | null>> = {
      prodes: prodesLayerRef, deter: deterLayerRef, queimadas: focosLayerRef,
      uc: ucLayerRef, ti: tiLayerRef, assentamento: assentamentoLayerRef, quilombola: quilombolaLayerRef,
    };
    const layer = layerMap[id as Exclude<LayerId, 'propriedades'>].current;
    if (!layer) return;
    if (!isOn) { layer.clearLayers(); return; }
    await carregarCamada(id);
  }, [carregarCamada, carregarPropriedadesViewport]);

  const filtroAnoAnteriorRef = useRef<number | null>(null);
  useEffect(() => {
    if (filtroAnoAnteriorRef.current === filtroAno) return;
    filtroAnoAnteriorRef.current = filtroAno;
    (['prodes', 'deter'] as LayerId[]).forEach((id) => {
      if (layerVisibleRef.current[id]) void carregarCamada(id);
    });
  }, [filtroAno, carregarCamada]);

  const carregarAreasProtegidas = useCallback(async (codImovel: string) => {
    setAreasProtegidasStats(null);
    const base = `/gerenciamento_banco/banco`;
    const endpoints: [keyof AreasProtegidasStats, string][] = [
      ['uc', 'unidade-conservacao'],
      ['ti', 'terra-indigena'],
      ['assentamento', 'assentamento'],
      ['quilombola', 'quilombola'],
    ];
    const result: AreasProtegidasStats = { uc: [], ti: [], assentamento: [], quilombola: [] };
    await Promise.all(
      endpoints.map(async ([chave, path]) => {
        try {
          const r = await fetch(`${base}/${path}/por-propriedade/${encodeURIComponent(codImovel)}`);
          if (r.ok) result[chave] = await r.json();
        } catch { /* silently ignore */ }
      })
    );
    setAreasProtegidasStats(result);
    const n_ti = result.ti.length;
    const n_uc = result.uc.length;
    if (n_ti > 0) addToast('error', `Terra Indígena: ${n_ti} sobreposição(ões)`, result.ti.map(t => t.nome ?? t.cod_ti).join(', '));
    if (n_uc > 0) addToast('warning', `UC: ${n_uc} sobreposição(ões)`, result.uc.map(u => u.nome ?? u.cod_uc).join(', '));
  }, [addToast]);

  const carregarPropriedadePorCAR = useCallback(async (cod: string) => {
    const map = mapRef.current;
    const resultLayer = resultLayerRef.current;
    if (!map || !resultLayer) return;

    resultLayer.clearLayers();
    neighborsLayerRef.current?.clearLayers();
    prodesLayerRef.current?.clearLayers();
    deterLayerRef.current?.clearLayers();
    focosLayerRef.current?.clearLayers();
    setPropriedade(null);
    setAnaliseASG(null);
    setRelatorioASG(null);
    setInpeStats(null);
    setSobreposicaoProdes(null);
    setAreasProtegidasStats(null);
    propriedadeRef.current = null;

    try {
      const resp = await fetch(`/ingestao/propriedades/${encodeURIComponent(cod)}`);
      if (!resp.ok) {
        if (resp.status === 404) addToast('error', 'Não encontrado', `"${cod}" não existe no banco nem no SICAR.`);
        else addToast('error', `Erro ${resp.status}`, 'Falha ao consultar o serviço de ingestão.');
        return;
      }

      const prop = await resp.json() as PropriedadeBackend;
      propriedadeRef.current = prop;
      setPropriedade(prop);

      if (prop.geometria) {
        const geoLayer = L.geoJSON(prop.geometria as GeoJSON.Geometry, {
          style: { color: '#0d3e92', weight: 3, fillColor: '#2aa7d9', fillOpacity: 0.35 }
        });
        const popupLines = [
          `<strong>CAR:</strong> ${prop.cod_imovel}`,
          prop.status_imovel     ? `<strong>Situação:</strong> ${prop.status_imovel}`                            : null,
          prop.condicao          ? `<strong>Condição:</strong> ${prop.condicao}`                                 : null,
          prop.tipo_imovel       ? `<strong>Tipo:</strong> ${prop.tipo_imovel}`                                  : null,
          prop.municipio         ? `<strong>Município:</strong> ${prop.municipio}${prop.uf ? `/${prop.uf}` : ''}` : null,
          prop.cod_municipio_ibge ? `<strong>IBGE:</strong> ${prop.cod_municipio_ibge}`                          : null,
          prop.area              ? `<strong>Área:</strong> ${prop.area.toFixed(2)} ha`                           : null,
          prop.m_fiscal          ? `<strong>Módulo fiscal:</strong> ${prop.m_fiscal}`                            : null,
          prop.dat_criacao       ? `<strong>Criado em:</strong> ${new Date(prop.dat_criacao).toLocaleDateString('pt-BR')}` : null,
        ].filter(Boolean).join('<br/>');
        geoLayer.bindPopup(`<div style="font-size:0.8rem;line-height:1.6">${popupLines}</div>`, { maxWidth: 280 }).addTo(resultLayer);
        map.fitBounds(geoLayer.getBounds(), { padding: [40, 40] });
        addToast('success', 'Propriedade encontrada',
          `${prop.municipio ?? ''}${prop.uf ? `/${prop.uf}` : ''}${prop.area ? ` · ${prop.area.toFixed(1)} ha` : ''}`);
        void carregarInpe(prop.cod_imovel);
        void carregarAreasProtegidas(prop.cod_imovel);
        if (prop.municipio && prop.uf) {
          void (async () => {
            try {
              const params = new URLSearchParams({ uf: prop.uf!, municipio: prop.municipio!, limit: appSettings.vizinhosLimit.toString() });
              const nr = await fetch(`/gerenciamento_banco/banco/propriedades?${params}`);
              if (!nr.ok) return;
              const neighbors = await nr.json() as PropriedadeBackend[];
              const layer = neighborsLayerRef.current;
              if (!layer) return;
              layer.clearLayers();
              let count = 0;
              for (const n of neighbors) {
                if (!n.geometria || n.cod_imovel === prop.cod_imovel) continue;
                const cod = n.cod_imovel;
                const popupHtml = `<div style="display:flex;align-items:center;gap:8px;padding:2px 0;max-width:340px">
                  <span style="font-family:monospace;font-size:11px;word-break:break-all;flex:1">${cod}</span>
                  <button class="sicar-copy-btn" title="Copiar código" style="background:none;border:1px solid #aaa;border-radius:4px;cursor:pointer;padding:4px 6px;display:flex;align-items:center;flex-shrink:0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                </div>`;
                const geoLayer = L.geoJSON(n.geometria as GeoJSON.Geometry, {
                  style: { color: '#5a8abf', weight: 1, fillColor: '#91c4e8', fillOpacity: 0.12, dashArray: '3 3' }
                })
                  .bindPopup(popupHtml, { maxWidth: 400 });
                geoLayer.on('popupopen', (e) => {
                  const popup = (e as L.PopupEvent).popup.getElement();
                  popup?.querySelector('.sicar-copy-btn')?.addEventListener('click', () => {
                    void navigator.clipboard.writeText(cod);
                    addToast('success', 'Código SICAR copiado!', cod);
                  });
                });
                geoLayer.addTo(layer);
                count++;
              }
              if (count > 0) addToast('info', `${count} propriedades vizinhas`, `Município de ${prop.municipio}`);
            } catch { /* silently ignore */ }
          })();
        }
      } else {
        addToast('warning', 'Propriedade sem geometria', 'Dados cadastrais encontrados, mas sem polígono no banco.');
      }

      void (async () => {
        try {
          const asgResp = await fetch(`/cruzamento_asg/asg/analises/${encodeURIComponent(cod)}`);
          if (asgResp.ok) setAnaliseASG(await asgResp.json() as AnaliseASG);
        } catch { /* não crítico */ }
      })();
      void (async () => {
        try {
          const relResp = await fetch(`/cruzamento_asg/asg/relatorio/${encodeURIComponent(cod)}`);
          if (relResp.ok) setRelatorioASG(await relResp.json() as RelatorioASG);
        } catch { /* não crítico */ }
      })();
      void (async () => {
        try {
          const consResp = await fetch(`/cruzamento_asg/relatorio/car/${encodeURIComponent(cod)}/asg`);
          if (consResp.ok) {
            const d = await consResp.json() as { resumo_asg: ResumoASGConsolidado };
            setResumoASG(d.resumo_asg);
          }
        } catch { /* não crítico */ }
      })();
    } catch (err) {
      addToast('error', 'Erro de rede', err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, [carregarInpe, carregarAreasProtegidas, addToast]);

  // Busca
  const handleSearch = async () => {
    const query = searchValue.trim();
    const map = mapRef.current;
    const resultLayer = resultLayerRef.current;
    if (!map || !resultLayer || searching) return;
    if (!query) return;

    // Coordenadas
    const coords = parseCoordinates(query);
    if (coords) {
      resultLayer.clearLayers();
      neighborsLayerRef.current?.clearLayers();
      setPropriedade(null); setAnaliseASG(null); setRelatorioASG(null); setResumoASG(null); setInpeStats(null); setAreasProtegidasStats(null);
      const [lat, lng] = coords;
      L.circleMarker([lat, lng], { radius: 8, color: '#1263a8', fillColor: '#41b0e4', fillOpacity: 0.9, weight: 2 })
        .bindPopup(`${lat.toFixed(6)}, ${lng.toFixed(6)}`).addTo(resultLayer).openPopup();
      map.flyTo([lat, lng], 14, { duration: 0.7 });
      addToast('info', 'Coordenadas localizadas', `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      return;
    }

    // CAR
    const cod = query.toUpperCase();
    setSearching(true);
    propriedadeViaChat.current = false;
    addToast('info', 'Consultando...', `Buscando ${cod} no banco e no SICAR`);
    try {
      await carregarPropriedadePorCAR(cod);
    } finally {
      setSearching(false);
    }
  };

  // Chat
  const scrollChatToBottom = () => {
    requestAnimationFrame(() => {
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    });
  };

  const handleSendChat = async (overrideMsg?: string) => {
    const msg = (overrideMsg ?? chatInput).trim();
    if (!msg || chatSending) return;

    for (const lid of chatActivatedLayersRef.current) {
      if (layerVisibleRef.current[lid]) void toggleCamada(lid);
    }
    chatActivatedLayersRef.current = [];
    setChatSuggestions([]);

    setChatMessages((c) => [...c, { id: Date.now(), role: 'outgoing', text: msg }]);
    if (!overrideMsg) setChatInput('');
    setChatSending(true);
    scrollChatToBottom();
    try {
      const resp = await fetch('/busca_semantica/busca/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pergunta: msg,
          cod_imovel: propriedade?.cod_imovel ?? null,
          municipio_contexto: chatContextRef.current.municipio ?? null,
          intencao_contexto: chatContextRef.current.intencao ?? null,
        }),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const data = await resp.json() as {
        resposta?: string;
        acao?: string;
        cod_imovel?: string;
        municipio_detectado?: string;
        coordenadas_detectadas?: [number, number];
        intencao_detectada?: string;
      };

      setChatMessages((c) => [...c, { id: Date.now() + 1, role: 'incoming', text: data.resposta ?? 'Sem resposta.' }]);

      chatContextRef.current = {
        municipio: data.municipio_detectado
          ?? (data.acao ? chatContextRef.current.municipio : undefined),
        intencao: data.intencao_detectada ?? chatContextRef.current.intencao,
      };

      setChatSuggestions(getSuggestions(
        data.intencao_detectada,
        !!(data.cod_imovel ?? propriedade?.cod_imovel),
        data.municipio_detectado ?? chatContextRef.current.municipio,
      ));

      // sincroniza painéis laterais com o CAR retornado pelo chat
      if (data.cod_imovel && data.cod_imovel !== propriedadeRef.current?.cod_imovel) {
        propriedadeViaChat.current = true;
        void carregarPropriedadePorCAR(data.cod_imovel);
      } else if (propriedadeViaChat.current && data.acao === 'zoom_municipio') {
        propriedadeViaChat.current = false;
        resultLayerRef.current?.clearLayers();
        neighborsLayerRef.current?.clearLayers();
        propriedadeRef.current = null;
        setPropriedade(null);
        setAnaliseASG(null);
        setRelatorioASG(null);
        setResumoASG(null);
        setInpeStats(null);
        setAreasProtegidasStats(null);
      }

      // ativa camadas relacionadas à intenção e registra para reset na próxima pergunta
      const INTENT_LAYERS: Record<string, LayerId[]> = {
        desmatamento: ['prodes'],
        queimada:     ['queimadas'],
        alerta:       ['deter'],
        indigena:     ['ti'],
        conservacao:  ['uc'],
        comunidades:  ['assentamento', 'quilombola'],
        relatorio:    ['prodes', 'deter', 'queimadas', 'uc', 'ti', 'assentamento', 'quilombola'],
      };
      if (data.intencao_detectada) {
        const layers = INTENT_LAYERS[data.intencao_detectada] ?? [];
        const activated: LayerId[] = [];
        for (const lid of layers) {
          if (!layerVisibleRef.current[lid]) {
            void toggleCamada(lid);
            activated.push(lid);
          }
        }
        chatActivatedLayersRef.current = activated;
      }

      // zoom no mapa com base na ação retornada pelo chat
      if (mapRef.current) {
        const map = mapRef.current;
        if (data.acao === 'zoom_propriedade') {
          if (data.cod_imovel && propriedade?.cod_imovel === data.cod_imovel && resultLayerRef.current) {
            const bounds = resultLayerRef.current.getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
          } else if (data.coordenadas_detectadas) {
            const [lat, lon] = data.coordenadas_detectadas;
            map.flyTo([lat, lon], 14, { duration: 0.8 });
          }
        } else if (data.acao === 'zoom_municipio' && data.municipio_detectado) {
          void (async () => {
            try {
              const q = encodeURIComponent(`${data.municipio_detectado}, São Paulo, Brasil`);
              const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
              const results = await geo.json() as { lat: string; lon: string }[];
              if (results.length > 0) {
                map.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 11, { duration: 1.0 });
              }
            } catch { /* silently ignore */ }
          })();
        } else if (data.coordenadas_detectadas) {
          const [lat, lon] = data.coordenadas_detectadas;
          map.flyTo([lat, lon], 14, { duration: 0.8 });
        }
      }
    } catch (err) {
      addToast('error', 'Erro no chat', err instanceof Error ? err.message : 'Falha ao consultar.');
      setChatMessages((c) => [...c, { id: Date.now() + 1, role: 'incoming', text: 'Não foi possível conectar ao serviço. Verifique se o backend está rodando ou tente novamente.' }]);
    } finally {
      setChatSending(false);
      scrollChatToBottom();
    }
  };

  const handleClearChat = () => {
    for (const lid of chatActivatedLayersRef.current) {
      if (layerVisibleRef.current[lid]) void toggleCamada(lid);
    }
    chatActivatedLayersRef.current = [];
    chatContextRef.current = {};
    setChatMessages([{ id: Date.now(), role: 'incoming', text: 'Nova conversa iniciada. Como posso ajudar?' }]);
    setChatSuggestions(['Cidades com mais queimadas', 'Maior desmatamento SP', 'Relatório ASG']);
    if (propriedadeViaChat.current) {
      propriedadeViaChat.current = false;
      resultLayerRef.current?.clearLayers();
      neighborsLayerRef.current?.clearLayers();
      propriedadeRef.current = null;
      setPropriedade(null); setAnaliseASG(null); setRelatorioASG(null);
      setResumoASG(null); setInpeStats(null); setAreasProtegidasStats(null);
    }
  };
  const asgRows = analiseASG ? [
    { eixo: 'Ambiental', indicador: 'Desmat. PRODES', valor: analiseASG.area_desmatada_ha != null ? `${analiseASG.area_desmatada_ha} ha` : '—' },
    { eixo: 'Ambiental', indicador: 'Déficit APP',    valor: analiseASG.deficit_app_ha != null ? `${analiseASG.deficit_app_ha} ha` : '—' },
    { eixo: 'Ambiental', indicador: 'Déficit RL',     valor: analiseASG.deficit_reserva_legal_ha != null ? `${analiseASG.deficit_reserva_legal_ha} ha` : '—' },
    { eixo: 'Social',    indicador: 'UCs',            valor: analiseASG.sobreposicao_uc ?? '—' },
    { eixo: 'Social',    indicador: 'TI',             valor: analiseASG.sobreposicao_ti ?? '—' },
    { eixo: 'Governança', indicador: 'CAR',           valor: propriedade?.status_imovel ?? '—' },
  ] : [];

// ── Login ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUser, password: authPass })
      });

      if (!res.ok) throw new Error('Usuário ou senha inválidos');
      
      const data = await res.json() as { token: string };
      setAuthToken(data.token);
      setIsLoggedIn(true);
      setAuthUser('');
      setAuthPass('');
      addToast('success', 'Acesso liberado', 'Bem-vindo ao painel de administração.');
    } catch (err) {
      addToast('error', 'Acesso negado', err instanceof Error ? err.message : 'Erro ao conectar.');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setAuthToken(null);
    setIsModalOpen(false);
  };

  // ── Modal Admin ──
  useEffect(() => {
    if (!isModalOpen || !authToken || adminTab !== 'ingestao') return;

    setFontesAdmin(FONTES_INICIAIS);
    
    FONTES_INICIAIS.forEach(async (fonte) => {
      try {
        const res = await fetch(`/admin/verificar-atualizacao/${fonte.id}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!res.ok) throw new Error('Falha na verificação');
        const data = await res.json() as { ha_novos_dados: boolean; total_local: number };
        
        setFontesAdmin((prev) => prev.map((f) => 
          f.id === fonte.id ? { 
            ...f, 
            status: data.ha_novos_dados ? 'update-available' : 'up-to-date',
            total_registros: data.total_local
          } : f
        ));
      } catch {
        setFontesAdmin((prev) => prev.map((f) => f.id === fonte.id ? { ...f, status: 'error' } : f));
      }
    });
  }, [isModalOpen, authToken, adminTab]);

  const startUpdate = async (fonteId: FonteId) => {
    if (!authToken) return;
    setFontesAdmin((prev) => prev.map((f) => f.id === fonteId ? { ...f, status: 'updating', progresso: 0 } : f));
    
    try {
      const resStart = await fetch(`/admin/atualizar/${fonteId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!resStart.ok) throw new Error('Falha ao iniciar ingestão');
      const poll = async () => {
        try {
          const res = await fetch('/admin/status', {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          
          if (!res.ok) throw new Error('Erro no polling');
          const statusDict = await res.json() as Record<string, any>;
          const fonteStatus = statusDict[fonteId]; 
          const progresso = fonteStatus?.progresso ?? 0;
          const statusAtual = fonteStatus?.status;

          setFontesAdmin((prev) => prev.map((f) => f.id === fonteId ? { ...f, progresso: progresso } : f));

          if (statusAtual === 'concluido') {
            setFontesAdmin((prev) => prev.map((f) => f.id === fonteId ? { ...f, status: 'up-to-date', progresso: 100 } : f));
            addToast('success', 'Atualização Concluída', `A fonte ${fonteId.toUpperCase()} foi atualizada com sucesso.`);
          } else if (statusAtual === 'erro' || statusAtual === 'Indisponível') {
            setFontesAdmin((prev) => prev.map((f) => f.id === fonteId ? { ...f, status: 'error' } : f));
            addToast('error', 'Erro na Ingestão', `Falha ao atualizar ${fonteId.toUpperCase()}.`);
          } else {
            setTimeout(poll, 3000);
          }
        } catch {
          setFontesAdmin((prev) => prev.map((f) => f.id === fonteId ? { ...f, status: 'error' } : f));
        }
      };
      setTimeout(poll, 3000);

    } catch (err) {
      setFontesAdmin((prev) => prev.map((f) => f.id === fonteId ? { ...f, status: 'error' } : f));
      addToast('error', 'Erro', 'Não foi possível iniciar a atualização.');
    }
  };

  // Admin Settings Handlers
  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTempSettings((prev) => ({ ...prev, [name]: Number(value) }));
  };

  const handleSaveSettings = () => {
    saveSettings(tempSettings);
    setAppSettings(tempSettings);
    addToast('success', 'Configurações Salvas', 'Os novos parâmetros já estão em vigor.');
  };

  const handleRestoreSettings = () => {
    setTempSettings(DEFAULT_SETTINGS);
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <main className="skeleton-page">
        <header className="shell shell-topbar">
          <div className="topbar-brand">
            <img src={logoMark} alt="Logo Stratos" className="brand-logo" />
            <span className="brand-title">Stratos</span>
          </div>

          <div className="topbar-right">
            {isLoggedIn ? (
              <div className="topbar-auth">
                <button type="button" className="auth-button" onClick={() => { setAdminTab('ingestao'); setIsModalOpen(true); }}>
                  Painel Admin
                </button>
                <button type="button" className="auth-button" style={{ background: 'transparent', border: '2px solid var(--control-line)', color: 'var(--control-line)' }} onClick={handleLogout}>
                  Sair
                </button>
              </div>
            ) : (
              <form className="topbar-auth" onSubmit={handleLogin}>
                <input 
                  type="text" 
                  placeholder="Usuário" 
                  className="auth-input" 
                  value={authUser}
                  onChange={(e) => setAuthUser(e.target.value)}
                />
                <input 
                  type="password" 
                  placeholder="Senha" 
                  className="auth-input" 
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                />
                <button type="submit" className="auth-button">
                  Entrar
                </button>
              </form>
            )}

            {/* ── Menu de Tema ── */}
            <div className="topbar-actions" ref={menuRef}>
              <button type="button" className="theme-gear" onClick={() => setIsThemeMenuOpen((s) => !s)} aria-label="Tema">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.5 7.5 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.5 7.5 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.63l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
                </svg>
              </button>
              {isThemeMenuOpen && (
                <div className="theme-popup" role="dialog">
                  <div className="theme-switch-row">
                    <button type="button" role="switch" aria-checked={theme === 'dark'}
                      className={`theme-switch ${theme === 'dark' ? 'is-dark' : ''}`}
                      onClick={() => setTheme((t) => t === 'light' ? 'dark' : 'light')}>
                      <span className="theme-switch-icon" aria-hidden="true">
                        {theme === 'dark'
                          ? <svg viewBox="0 0 24 24"><path d="M12.1 2.2a1 1 0 0 0-1.1 1.2 8 8 0 0 1-8.4 9.8 1 1 0 0 0-.8 1.6A10 10 0 1 0 12.1 2.2Z" /></svg>
                          : <svg viewBox="0 0 24 24"><path d="M12 4.2a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0V5.2a1 1 0 0 1 1-1Zm0 12.5a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0v-1.1a1 1 0 0 1 1-1Zm7.8-5.7a1 1 0 0 1 1 1 1 1 0 0 1-1 1h-1.1a1 1 0 1 1 0-2h1.1ZM6.3 11a1 1 0 1 1 0 2H5.2a1 1 0 1 1 0-2h1.1Zm9.3-4.9a1 1 0 0 1 1.4 0l.8.8a1 1 0 1 1-1.4 1.4l-.8-.8a1 1 0 0 1 0-1.4ZM7.2 14.6a1 1 0 0 1 1.4 0 1 1 0 0 1 0 1.4l-.8.8a1 1 0 0 1-1.4-1.4l.8-.8Zm9.2 2a1 1 0 0 1-1.4 0l-.8-.8a1 1 0 1 1 1.4-1.4l.8.8a1 1 0 0 1 0 1.4ZM8.6 8.2a1 1 0 1 1-1.4-1.4l.8-.8A1 1 0 1 1 9.4 7.4l-.8.8ZM12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" /></svg>}
                      </span>
                      <span className="theme-switch-thumb" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="skeleton-grid">
          {/* ── LEFT ── */}
          <aside className="shell shell-left">
            <section className="left-status-panel">
              <h3 className="left-status-title">Status de dados</h3>

              {!propriedade && (
                <p className="left-status-empty">Busque um imóvel pelo código CAR para visualizar os dados da propriedade.</p>
              )}

              {propriedade && (
                <div className="data-status-row">
                  <div className="data-status-header">
                    <span className="data-status-dot is-available" />
                    <strong className="data-status-label">Propriedade</strong>
                  </div>
                  <span className="data-status-message">{propriedade.cod_imovel}</span>
                  {propriedade.municipio && <span className="data-status-message">{propriedade.municipio}{propriedade.uf ? `/${propriedade.uf}` : ''}</span>}
                  {propriedade.area != null && <span className="data-status-message">Área: {propriedade.area.toFixed(2)} ha</span>}
                  {propriedade.status_imovel && <span className="data-status-message">Status: {propriedade.status_imovel}</span>}
                  {propriedade.condicao && <span className="data-status-message">Condição: {propriedade.condicao}</span>}
                  {propriedade.tipo_imovel && <span className="data-status-message">Tipo: {propriedade.tipo_imovel}</span>}
                  {propriedade.cod_municipio_ibge && <span className="data-status-message">IBGE: {propriedade.cod_municipio_ibge}</span>}
                  {propriedade.m_fiscal && <span className="data-status-message">Módulo fiscal: {propriedade.m_fiscal}</span>}
                  {propriedade.dat_criacao && <span className="data-status-message">Criado: {new Date(propriedade.dat_criacao).toLocaleDateString('pt-BR')}</span>}
                </div>
              )}

              {propriedade?.area != null && sobreposicaoProdes && (() => {
                const areaTotal = propriedade.area!;
                const pct = areaTotal > 0 ? (sobreposicaoProdes.area_ha / areaTotal) * 100 : 0;
                const cor = pct < 5 ? '#059669' : pct <= 20 ? '#d97706' : '#dc2626';
                return (
                  <div className="data-status-row">
                    <div className="data-status-header">
                      <span className="data-status-dot" style={{ background: cor }} />
                      <strong className="data-status-label">Área afetada por PRODES</strong>
                    </div>
                    <div className="afetada-wrap">
                      <div className="afetada-header">
                        <span style={{ color: cor, fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div className="afetada-bar-track">
                        <div className="afetada-bar-fill"
                             style={{ width: `${Math.min(pct, 100)}%`, background: cor }} />
                      </div>
                      <span className="data-status-message">
                        {sobreposicaoProdes.area_ha.toFixed(2)} ha de {areaTotal.toFixed(2)} ha totais ·{' '}
                        {sobreposicaoProdes.n_poligonos} polígono(s)
                      </span>
                    </div>
                  </div>
                );
              })()}

              {inpeStats && (
                <div className="data-status-row">
                  <div className="data-status-header">
                    <span className="data-status-dot" style={{ background: '#d97706' }} />
                    <strong className="data-status-label">Sobreposição INPE na propriedade</strong>
                  </div>
                  <span className="data-status-message" style={{ color: '#dc2626' }}>
                    DETER: {inpeStats.deter} alerta(s) sobrepostos
                  </span>
                  <span className="data-status-message" style={{ color: '#f59e0b' }}>
                    Queimadas: {inpeStats.focos} foco(s) dentro da propriedade
                  </span>
                </div>
              )}

              {areasProtegidasStats && (
                <div className="data-status-row">
                  <div className="data-status-header">
                    <span className="data-status-dot" style={{ background: '#7c3aed' }} />
                    <strong className="data-status-label">Áreas Protegidas na propriedade</strong>
                  </div>
                  <span className="data-status-message" style={{ color: areasProtegidasStats.uc.length > 0 ? '#dc2626' : undefined }}>
                    UC: {areasProtegidasStats.uc.length > 0
                      ? areasProtegidasStats.uc.map(u => u.nome ?? u.cod_uc).join(', ')
                      : 'Nenhuma sobreposição'}
                  </span>
                  <span className="data-status-message" style={{ color: areasProtegidasStats.ti.length > 0 ? '#dc2626' : undefined }}>
                    TI: {areasProtegidasStats.ti.length > 0
                      ? areasProtegidasStats.ti.map(t => t.nome ?? t.cod_ti).join(', ')
                      : 'Nenhuma sobreposição'}
                  </span>
                  <span className="data-status-message" style={{ color: areasProtegidasStats.assentamento.length > 0 ? '#d97706' : undefined }}>
                    Assentamento: {areasProtegidasStats.assentamento.length > 0
                      ? areasProtegidasStats.assentamento.map(a => a.nome ?? a.cod_sipra).join(', ')
                      : 'Nenhuma sobreposição'}
                  </span>
                  <span className="data-status-message" style={{ color: areasProtegidasStats.quilombola.length > 0 ? '#d97706' : undefined }}>
                    Quilombola: {areasProtegidasStats.quilombola.length > 0
                      ? areasProtegidasStats.quilombola.map(q => q.nome ?? q.cod_quilombola).join(', ')
                      : 'Nenhuma sobreposição'}
                  </span>
                </div>
              )}
            </section>
          </aside>

          {/* ── CENTER ── */}
          <section className="shell shell-center">
            <div className="map-search-box">
              <input type="text" value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
                placeholder="Código CAR — ex: SP-3509502-XXXXXXXX"
                disabled={searching}
              />
              <button type="button" onClick={() => void handleSearch()} disabled={searching}>
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
              <small className="search-hint">Ex.: SP-3509502-XXXXXXXX — cole o código CAR completo.</small>
            </div>

            <div className="ano-filter-bar">
              {([null, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024] as (number | null)[]).map((a) => (
                <button
                  key={a ?? 'all'}
                  type="button"
                  className={`ano-btn${filtroAno === a ? ' ano-btn--active' : ''}`}
                  onClick={() => setFiltroAno(a)}
                  title={a ? `Filtrar PRODES/DETER por ${a}` : 'Mostrar todos os anos'}
                >
                  {a ?? 'Todos'}
                </button>
              ))}
            </div>

            <div className="layer-toolbar">
              {([
                { id: 'prodes',       label: 'PRODES',        color: '#d97706', count: inpeProdesCount,    unit: 'pol.' },
                { id: 'deter',        label: 'DETER',         color: '#dc2626', count: inpeDeterCount,     unit: 'alertas' },
                { id: 'queimadas',    label: 'Queimadas',     color: '#f59e0b', count: inpeFocosCount,     unit: 'focos' },
                { id: 'uc',           label: 'UC',            color: '#059669', count: ucCount,            unit: 'UCs' },
                { id: 'ti',           label: 'TI',            color: '#7c3aed', count: tiCount,            unit: 'TIs' },
                { id: 'assentamento', label: 'Assentamentos', color: '#b45309', count: assentamentoCount,  unit: 'ass.' },
                { id: 'quilombola',   label: 'Quilombolas',   color: '#be185d', count: quilombolaCount,    unit: 'terr.' },
                { id: 'propriedades', label: 'Prop. Rurais',  color: '#0891b2', count: propriedadesCount,  unit: 'prop.' },
              ] as { id: LayerId; label: string; color: string; count: number | null; unit: string }[]).map(({ id, label, color, count, unit }) => {
                const on = layerVisible[id];
                const loading = layerLoadingRef.current[id];
                const dotClass = count === null ? 'is-checking' : count > 0 ? 'is-available' : 'is-unavailable';
                return (
                  <button
                    key={id}
                    className={`layer-btn${on ? ' layer-btn--on' : ''}${loading ? ' layer-btn-loading' : ''}`}
                    style={on ? { borderColor: color, color } : undefined}
                    onClick={() => void toggleCamada(id)}
                    title={on ? `Ocultar ${label}` : `Exibir ${label}`}
                  >
                    <span className="layer-btn-eye">
                      {on
                        ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      }
                    </span>
                    <span className={`data-status-dot layer-btn-dot ${dotClass}`} />
                    <span className="layer-btn-label">{label}</span>
                    {count !== null && count > 0 && (
                      <span className="layer-btn-count">{count.toLocaleString('pt-BR')} {unit}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="map-stage">
              <div ref={mapContainerRef} id="map-root" className="shell-map" />
            </div>
          </section>

          {/* ── RIGHT ── */}
          <aside className={`shell shell-right ${rightPanel === 'report-only' ? 'right-panel-report-only' : rightPanel === 'chat-only' ? 'right-panel-chat-only' : ''}`}>
            <div className="right-split-panel">
              <section className="asg-report-panel">
                <header className="asg-report-header">
                  <h3>Reports ASG</h3>
                  <button
                    className={`panel-collapse-btn ${rightPanel === 'report-only' ? 'is-expanded' : ''}`}
                    onClick={() => toggleRightPanel('report')}
                    aria-label="Toggle report panel"
                    aria-pressed={rightPanel === 'report-only'}
                  >
                    ▸
                  </button>
                  <div className="asg-header-actions">
                    {resumoASG && (
                      <span
                        className={`asg-risco-badge asg-risco-${resumoASG.nivel}`}
                        title={`Risco ${resumoASG.nivel} · ${resumoASG.indice_risco.toFixed(0)}/100`}
                      >
                        Risco {resumoASG.nivel} · {resumoASG.indice_risco.toFixed(0)}/100
                      </span>
                    )}
                    {propriedade && (
                      <a
                        className="asg-export-btn"
                        href={`/cruzamento_asg/relatorio/car/${encodeURIComponent(propriedade.cod_imovel)}/asg/export?formato=gpkg`}
                        download
                        title="Exportar GeoPackage para QGIS"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/></svg>
                        GPKG
                      </a>
                    )}
                    {propriedade && relatorioASG && (
                      <button
                        type="button"
                        className="asg-export-btn"
                        onClick={() => window.print()}
                        title="Exportar relatório em PDF (Ctrl+P)"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        PDF
                      </button>
                    )}
                  </div>
                </header>
                <div className="asg-report-content">
                  {propriedade && (
                    <div className="print-only-header">
                      <h2>Relatório ASG · {propriedade.cod_imovel}</h2>
                      <p>
                        {propriedade.municipio ?? ''}
                        {propriedade.uf ? `/${propriedade.uf}` : ''}
                        {propriedade.area != null ? ` · ${propriedade.area.toFixed(2)} ha` : ''}
                      </p>
                      <p>Gerado em {new Date().toLocaleString('pt-BR')}</p>
                    </div>
                  )}
                  {propriedade?.status_imovel && (
                    <CarStatusBadge status={propriedade.status_imovel} />
                  )}

                  {rightPanel !== 'chat-only' && (relatorioASG ? (
                    <div className="asg-indicadores">
                      {(['Ambiental', 'Social', 'Governança'] as const).map((cat) => {
                        const itens = relatorioASG.indicadores.filter(i => i.categoria === cat);
                        if (!itens.length) return null;
                        return (
                          <div
                            key={cat}
                            className={`asg-categoria-group asg-categoria-${cat.toLowerCase()}`}
                          >
                            <span className="asg-categoria-label">{cat}</span>
                            {itens.map((ind, idx) => (
                              <div key={idx} className="asg-indicador-row">
                                <div className="asg-indicador-main">
                                  <span className="asg-indicador-nome">{ind.nome}</span>
                                  {(() => {
                                    const statusLabel = ind.status === 'ok' ? 'OK' : ind.status === 'atencao' ? 'Atenção' : ind.status === 'critico' ? 'Crítico' : 'Pendente';
                                    return (
                                      <span className={`asg-status-badge asg-status-${ind.status}`} title={statusLabel}>
                                        {statusLabel}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div className="asg-indicador-valor">
                                  {ind.valor != null
                                    ? <strong>{ind.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {ind.unidade}</strong>
                                    : ind.detalhe
                                      ? <strong>{ind.detalhe}</strong>
                                      : <span>—</span>
                                  }
                                  {ind.valor != null && ind.detalhe && (
                                    <span className="asg-indicador-detalhe" title={String(ind.detalhe)}>{ind.detalhe}</span>
                                  )}
                                </div>
                                <div className="asg-indicador-meta">
                                  {ind.fonte} · {ind.data_referencia}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ) : propriedade ? (
                    <div className="asg-loading-panel">
                      <span className="asg-loading-text">Carregando indicadores ASG...</span>
                    </div>
                  ) : (
                    <div className="asg-empty-state">
                      <div>
                        <strong>Relatório ASG</strong>
                        <p>Busque um imóvel pelo código CAR para visualizar os indicadores ASG.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="chat-placeholder">
                <header className="chat-placeholder-header">
                  <h3>Chat ASG</h3>
                  <button
                    className={`panel-collapse-btn ${rightPanel === 'chat-only' ? 'is-expanded' : ''}`}
                    onClick={() => toggleRightPanel('chat')}
                    aria-label="Toggle chat panel"
                    aria-pressed={rightPanel === 'chat-only'}
                  >
                    ▸
                  </button>
                  {propriedade && <span title={propriedade.cod_imovel}>{propriedade.cod_imovel}</span>}
                  <button
                    type="button"
                    className="chat-clear-btn"
                    onClick={handleClearChat}
                    title="Nova conversa"
                    aria-label="Nova conversa"
                  >
                    <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.72"/></svg>
                  </button>
                </header>
                <div className="chat-placeholder-body" ref={chatBodyRef}>
                  {rightPanel !== 'report-only' && chatMessages.map((m) => (
                    <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
                      {renderChatText(m.text, m.role === 'incoming' ? carregarPropriedadePorCAR : undefined)}
                    </div>
                  ))}
                  {chatSending && (
                    <div className="chat-bubble chat-bubble-incoming chat-bubble-typing">
                      <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
                    </div>
                  )}
                  {chatSuggestions.length > 0 && !chatSending && (
                    <div className="chat-suggestions">
                      {chatSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="chat-suggestion-btn"
                          onClick={() => void handleSendChat(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <footer className="chat-placeholder-footer">
                  {rightPanel !== 'report-only' && (
                    <>
                      <input
                        type="text"
                        placeholder={propriedade ? `Pergunte sobre ${propriedade.cod_imovel}...` : 'Pergunte sobre municípios, coordenadas, desmatamento...'}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSendChat(); }}
                        disabled={chatSending}
                      />
                      <button type="button" onClick={() => void handleSendChat()} disabled={!chatInput.trim() || chatSending}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="currentColor" d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z"/></svg>
                      </button>
                    </>
                  )}
                </footer>
              </section>
            </div>
          </aside>
        </section>

        {/* ── Admin Modal ── */}
        {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-shell shell" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-tabs">
                <button 
                  className={`modal-tab ${adminTab === 'ingestao' ? 'active' : ''}`} 
                  onClick={() => setAdminTab('ingestao')}
                >
                  Gerenciamento de Dados
                </button>
                <button 
                  className={`modal-tab ${adminTab === 'settings' ? 'active' : ''}`} 
                  onClick={() => setAdminTab('settings')}
                >
                  Configurações Gerais
                </button>
              </div>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeWidth="2" stroke="currentColor" strokeLinecap="round" /></svg>
              </button>
            </header>
            
            <div className="modal-body">
              {adminTab === 'ingestao' && (
                fontesAdmin.map((fonte) => (
                  <div key={fonte.id} className="admin-fonte-row">
                    <div className="admin-fonte-left">
                      <strong className="admin-fonte-nome">{fonte.nome}</strong>
                      <div className="admin-fonte-meta">
                        {fonte.ultima_atualizacao && <span>Última: {fonte.ultima_atualizacao}</span>}
                        {fonte.total_registros != null && <span>Registros: {fonte.total_registros.toLocaleString('pt-BR')}</span>}
                      </div>
                    </div>
                    <div className="admin-fonte-right">
                      <div className="admin-fonte-status">
                        {fonte.status === 'checking' && <span className="admin-badge badge-checking">Verificando...</span>}
                        {fonte.status === 'up-to-date' && <span className="admin-badge badge-ok">Em dia</span>}
                        {fonte.status === 'update-available' && <span className="admin-badge badge-new">Nova Atualização</span>}
                        {fonte.status === 'updating' && <span className="admin-badge badge-updating">Atualizando...</span>}
                        {fonte.status === 'error' && <span className="admin-badge badge-error">Erro de conexão</span>}
                      </div>

                      <button 
                        className="auth-button" 
                        disabled={fonte.status !== 'update-available'}
                        onClick={() => void startUpdate(fonte.id)}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        {fonte.status === 'updating' ? 'Ingerindo...' : 'Atualizar'}
                      </button>

                      {fonte.status === 'updating' && (
                        <div className="admin-progress-bar">
                          <div className="admin-progress-fill" style={{ width: `${fonte.progresso ?? 0}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {adminTab === 'settings' && (
                <div className="admin-settings-form">
                  <div className="settings-grid">
                    <div className="settings-field">
                      <label>Raio para focos de queimada (metros)</label>
                      <input type="number" name="queimadasBufferM" value={tempSettings.queimadasBufferM} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Máx. PRODES no mapa (polígonos)</label>
                      <input type="number" name="prodesLimit" value={tempSettings.prodesLimit} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Máx. DETER no mapa (alertas)</label>
                      <input type="number" name="deterLimit" value={tempSettings.deterLimit} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Máx. Queimadas no mapa (focos)</label>
                      <input type="number" name="queimadasLimit" value={tempSettings.queimadasLimit} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Máx. Áreas Protegidas (UC/TI/etc)</label>
                      <input type="number" name="areasProtegidasLimit" value={tempSettings.areasProtegidasLimit} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Máx. propriedades vizinhas</label>
                      <input type="number" name="vizinhosLimit" value={tempSettings.vizinhosLimit} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Latitude Centro do Mapa</label>
                      <input type="number" step="0.01" name="mapCenterLat" value={tempSettings.mapCenterLat} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Longitude Centro do Mapa</label>
                      <input type="number" step="0.01" name="mapCenterLng" value={tempSettings.mapCenterLng} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Zoom Inicial do Mapa</label>
                      <input type="number" name="mapZoom" value={tempSettings.mapZoom} onChange={handleSettingsChange} />
                    </div>
                    <div className="settings-field">
                      <label>Duração do Toast (ms)</label>
                      <input type="number" name="toastDurationMs" value={tempSettings.toastDurationMs} onChange={handleSettingsChange} />
                    </div>
                  </div>
                  
                  <div className="admin-settings-actions">
                    <button type="button" className="auth-button restore-btn" onClick={handleRestoreSettings}>
                      Restaurar Padrões
                    </button>
                    <button type="button" className="auth-button save-btn" onClick={handleSaveSettings}>
                      Salvar Configurações
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </main>
    </>
  );
}
