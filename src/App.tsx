import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import logoMark from './static/logostratos.png';

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

type ResumoASGConsolidado = {
  indice_risco: number;
  nivel: 'baixo' | 'medio' | 'alto';
  desmatamento_relativo?: number | null;
};

type AdminFonteStatus = { status: 'concluido' | 'updating' | 'erro'; progresso: number };
type AdminFonteCheck = { id: string; fonte: string; total_local: number; total_remoto: number; ha_novos_dados: boolean };

type InpeFeature = {
  id: number;
  geometria?: { type: string; coordinates: unknown };
  [key: string]: unknown;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const THEME_KEY = 'stratos-theme';
const HEALTH_URL = '/gerenciamento_banco/health';
const SP_CENTER: [number, number] = [-22.5, -48.5];
const SP_ZOOM = 7;
const TOAST_DURATION = 5000;

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
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'incoming', text: 'Olá! Busque uma propriedade pelo código CAR para consultas ASG.' }
  ]);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Admin panel state
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminLogging, setAdminLogging] = useState(false);
  const [adminStatus, setAdminStatus] = useState<Record<string, AdminFonteStatus> | null>(null);
  const [adminVerificacao, setAdminVerificacao] = useState<AdminFonteCheck[] | null>(null);
  const [adminChecking, setAdminChecking] = useState(false);
  const [adminUpdating, setAdminUpdating] = useState<Record<string, boolean>>({});

  const menuRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const resultLayerRef = useRef<L.LayerGroup | null>(null);
  const neighborsLayerRef = useRef<L.LayerGroup | null>(null);
  const prodesLayerRef = useRef<L.LayerGroup | null>(null);
  const deterLayerRef = useRef<L.LayerGroup | null>(null);
  const focosLayerRef = useRef<L.LayerGroup | null>(null);
  const ucLayerRef = useRef<L.LayerGroup | null>(null);
  const tiLayerRef = useRef<L.LayerGroup | null>(null);
  const assentamentoLayerRef = useRef<L.LayerGroup | null>(null);
  const quilombolaLayerRef = useRef<L.LayerGroup | null>(null);

  type LayerId = 'prodes' | 'deter' | 'queimadas' | 'uc' | 'ti' | 'assentamento' | 'quilombola';
  const [layerVisible, setLayerVisible] = useState<Record<LayerId, boolean>>({
    prodes: false, deter: false, queimadas: false,
    uc: false, ti: false, assentamento: false, quilombola: false,
  });
  const layerLoadingRef = useRef<Record<LayerId, boolean>>({
    prodes: false, deter: false, queimadas: false,
    uc: false, ti: false, assentamento: false, quilombola: false,
  });

  // Toast helpers
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_DURATION);
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
    const map = L.map(mapContainerRef.current, { center: SP_CENTER, zoom: SP_ZOOM, zoomControl: false });
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
    neighborsLayerRef.current = L.layerGroup().addTo(map);
    resultLayerRef.current = L.layerGroup().addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    return () => { map.remove(); mapRef.current = null; tileLayerRef.current = null; resultLayerRef.current = null; neighborsLayerRef.current = null; prodesLayerRef.current = null; deterLayerRef.current = null; focosLayerRef.current = null; ucLayerRef.current = null; tiLayerRef.current = null; assentamentoLayerRef.current = null; quilombolaLayerRef.current = null; };
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

    // Focos — ST_DWithin 10 km da propriedade (amarelo)
    void (async () => {
      try {
        const r = await fetch(
          `/gerenciamento_banco/banco/foco-queimada/por-propriedade/${encodeURIComponent(codImovel)}?buffer_m=10000`
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
        if (list.length > 0) addToast('warning', `Queimadas: ${list.length} foco(s) (raio 10 km)`, 'Detectados 2016–2025');
      } catch { /* silently ignore */ }
    })();
  }, [addToast]);

  // Carrega (ou recarrega) o conteúdo de uma camada sem alterar sua visibilidade
  const carregarCamada = useCallback(async (id: LayerId) => {
    const layerMap: Record<LayerId, React.MutableRefObject<L.LayerGroup | null>> = {
      prodes: prodesLayerRef, deter: deterLayerRef, queimadas: focosLayerRef,
      uc: ucLayerRef, ti: tiLayerRef, assentamento: assentamentoLayerRef, quilombola: quilombolaLayerRef,
    };
    const layer = layerMap[id].current;
    if (!layer) return;
    if (layerLoadingRef.current[id]) return;
    layerLoadingRef.current[id] = true;
    layer.clearLayers();

    const anoParam = filtroAno ? `&ano=${filtroAno}` : '';
    const configs: Record<LayerId, { url: string; render: (f: InpeFeature, layer: L.LayerGroup) => void }> = {
      prodes: {
        url: `/gerenciamento_banco/banco/desmatamento-prodes?uf=SP&limit=1000${anoParam}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#d97706', weight: 1, fillColor: '#fbbf24', fillOpacity: 0.3 }
          }).bindTooltip(`PRODES ${f['ano'] ?? ''} · ${f['area_km2'] != null ? `${(f['area_km2'] as number).toFixed(2)} km²` : ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      deter: {
        url: `/gerenciamento_banco/banco/alerta-deter?uf=SP&limit=1000${anoParam}`,
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#dc2626', weight: 1, fillColor: '#f87171', fillOpacity: 0.35 }
          }).bindTooltip(`DETER · ${f['classname'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      queimadas: {
        url: '/gerenciamento_banco/banco/foco-queimada?estado=SP&limit=2000',
        render: (f, l) => {
          const lat = f['latitude'] as number | undefined;
          const lon = f['longitude'] as number | undefined;
          if (lat == null || lon == null) return;
          L.circleMarker([lat, lon], { radius: 3, color: '#92400e', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.7 })
            .bindTooltip(`Foco · ${f['satelite'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      uc: {
        url: '/gerenciamento_banco/banco/unidade-conservacao?uf=SP&limit=500',
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#059669', weight: 1.5, fillColor: '#34d399', fillOpacity: 0.3 }
          }).bindTooltip(`UC: ${f['nome'] ?? f['cod_uc'] ?? ''} · ${f['categoria'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      ti: {
        url: '/gerenciamento_banco/banco/terra-indigena?uf=SP&limit=500',
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#7c3aed', weight: 1.5, fillColor: '#a78bfa', fillOpacity: 0.35 }
          }).bindTooltip(`TI: ${f['nome'] ?? f['cod_ti'] ?? ''} · ${f['etnia'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      assentamento: {
        url: '/gerenciamento_banco/banco/assentamento?uf=SP&limit=500',
        render: (f, l) => {
          if (!f.geometria) return;
          L.geoJSON(f.geometria as GeoJSON.Geometry, {
            style: { color: '#b45309', weight: 1.5, fillColor: '#fcd34d', fillOpacity: 0.3 }
          }).bindTooltip(`Assentamento: ${f['nome'] ?? f['cod_sipra'] ?? ''}`, { sticky: true, opacity: 0.9 }).addTo(l);
        },
      },
      quilombola: {
        url: '/gerenciamento_banco/banco/quilombola?uf=SP&limit=500',
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
    }
  }, [filtroAno]);

  const toggleCamada = useCallback(async (id: LayerId) => {
    const isOn = !layerVisible[id];
    setLayerVisible(prev => ({ ...prev, [id]: isOn }));

    const layerMap: Record<LayerId, React.MutableRefObject<L.LayerGroup | null>> = {
      prodes: prodesLayerRef, deter: deterLayerRef, queimadas: focosLayerRef,
      uc: ucLayerRef, ti: tiLayerRef, assentamento: assentamentoLayerRef, quilombola: quilombolaLayerRef,
    };
    const layer = layerMap[id].current;
    if (!layer) return;
    if (!isOn) { layer.clearLayers(); return; }
    await carregarCamada(id);
  }, [layerVisible, carregarCamada]);

  // Recarrega PRODES/DETER automaticamente quando o filtro de ano muda
  const filtroAnoAnteriorRef = useRef<number | null>(null);
  useEffect(() => {
    if (filtroAnoAnteriorRef.current === filtroAno) return;
    filtroAnoAnteriorRef.current = filtroAno;
    (['prodes', 'deter'] as LayerId[]).forEach((id) => {
      if (layerVisible[id]) void carregarCamada(id);
    });
  }, [filtroAno, layerVisible, carregarCamada]);

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

  // Busca
  const handleSearch = async () => {
    const query = searchValue.trim();
    const map = mapRef.current;
    const resultLayer = resultLayerRef.current;
    if (!map || !resultLayer || searching) return;

    resultLayer.clearLayers();
    neighborsLayerRef.current?.clearLayers();
    prodesLayerRef.current?.clearLayers();
    deterLayerRef.current?.clearLayers();
    focosLayerRef.current?.clearLayers();
    setPropriedade(null);
    setAnaliseASG(null);
    setRelatorioASG(null);
    setResumoASG(null);
    setInpeStats(null);
    setSobreposicaoProdes(null);
    setAreasProtegidasStats(null);
    if (!query) return;

    // Coordenadas
    const coords = parseCoordinates(query);
    if (coords) {
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
    addToast('info', 'Consultando...', `Buscando ${cod} no banco e no SICAR`);

    try {
      const resp = await fetch(`/ingestao/propriedades/${encodeURIComponent(cod)}`);

      if (!resp.ok) {
        if (resp.status === 404) {
          addToast('error', 'Não encontrado', `"${cod}" não existe no banco nem no SICAR.`);
        } else {
          addToast('error', `Erro ${resp.status}`, 'Falha ao consultar o serviço de ingestão.');
        }
        return;
      }

      const prop = await resp.json() as PropriedadeBackend;
      setPropriedade(prop);

      if (prop.geometria) {
        const geoLayer = L.geoJSON(prop.geometria as GeoJSON.Geometry, {
          style: { color: '#0d3e92', weight: 3, fillColor: '#2aa7d9', fillOpacity: 0.35 }
        });
        const popupLines = [
          `<strong>CAR:</strong> ${prop.cod_imovel}`,
          prop.status_imovel   ? `<strong>Situação:</strong> ${prop.status_imovel}`                            : null,
          prop.condicao        ? `<strong>Condição:</strong> ${prop.condicao}`                                 : null,
          prop.tipo_imovel     ? `<strong>Tipo:</strong> ${prop.tipo_imovel}`                                  : null,
          prop.municipio       ? `<strong>Município:</strong> ${prop.municipio}${prop.uf ? `/${prop.uf}` : ''}` : null,
          prop.cod_municipio_ibge ? `<strong>IBGE:</strong> ${prop.cod_municipio_ibge}`                        : null,
          prop.area            ? `<strong>Área:</strong> ${prop.area.toFixed(2)} ha`                           : null,
          prop.m_fiscal        ? `<strong>Módulo fiscal:</strong> ${prop.m_fiscal}`                            : null,
          prop.dat_criacao     ? `<strong>Criado em:</strong> ${new Date(prop.dat_criacao).toLocaleDateString('pt-BR')}` : null,
        ].filter(Boolean).join('<br/>');
        geoLayer.bindPopup(`<div style="font-size:0.8rem;line-height:1.6">${popupLines}</div>`, { maxWidth: 280 }).addTo(resultLayer);
        map.fitBounds(geoLayer.getBounds(), { padding: [40, 40] });
        addToast('success', 'Propriedade encontrada',
          `${prop.municipio ?? ''}${prop.uf ? `/${prop.uf}` : ''}${prop.area ? ` · ${prop.area.toFixed(1)} ha` : ''}`);

        // Dados INPE espacialmente sobrepostos à propriedade (ST_Intersects / ST_DWithin)
        void carregarInpe(prop.cod_imovel);
        void carregarAreasProtegidas(prop.cod_imovel);

        // Propriedades vizinhas (background layer)
        if (prop.municipio && prop.uf) {
          void (async () => {
            try {
              const params = new URLSearchParams({ uf: prop.uf!, municipio: prop.municipio!, limit: '200' });
              const nr = await fetch(`/gerenciamento_banco/banco/propriedades?${params}`);
              if (!nr.ok) return;
              const neighbors = await nr.json() as PropriedadeBackend[];
              const layer = neighborsLayerRef.current;
              if (!layer) return;
              layer.clearLayers();
              let count = 0;
              for (const n of neighbors) {
                if (!n.geometria || n.cod_imovel === prop.cod_imovel) continue;
                L.geoJSON(n.geometria as GeoJSON.Geometry, {
                  style: { color: '#5a8abf', weight: 1, fillColor: '#91c4e8', fillOpacity: 0.12, dashArray: '3 3' }
                }).bindTooltip(n.cod_imovel, { sticky: true, opacity: 0.85 }).addTo(layer);
                count++;
              }
              if (count > 0) addToast('info', `${count} propriedades vizinhas`, `Município de ${prop.municipio}`);
            } catch { /* silently ignore */ }
          })();
        }
      } else {
        addToast('warning', 'Propriedade sem geometria', 'Dados cadastrais encontrados, mas sem polígono no banco.');
      }

      // Análise ASG (legado) + Relatório ASG (novo)
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
            const data = await consResp.json() as { resumo_asg: ResumoASGConsolidado };
            setResumoASG(data.resumo_asg);
          }
        } catch { /* não crítico */ }
      })();

    } catch (err) {
      addToast('error', 'Erro de rede', err instanceof Error ? err.message : 'Erro desconhecido');
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

  const handleSendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    setChatMessages((c) => [...c, { id: Date.now(), role: 'outgoing', text: msg }]);
    setChatInput('');
    setChatSending(true);
    scrollChatToBottom();
    try {
      const resp = await fetch('/busca_semantica/busca/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: msg, cod_imovel: propriedade?.cod_imovel ?? null }),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const data = await resp.json() as { resposta?: string };
      setChatMessages((c) => [...c, { id: Date.now() + 1, role: 'incoming', text: data.resposta ?? 'Sem resposta.' }]);
    } catch (err) {
      addToast('error', 'Erro no chat', err instanceof Error ? err.message : 'Falha ao consultar.');
      setChatMessages((c) => [...c, { id: Date.now() + 1, role: 'incoming', text: 'Erro ao consultar o serviço de busca.' }]);
    } finally {
      setChatSending(false);
      scrollChatToBottom();
    }
  };

  // Admin handlers
  const handleAdminLogin = async () => {
    if (adminLogging) return;
    setAdminLogging(true);
    try {
      const resp = await fetch('/gerenciamento_banco/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUser, password: adminPass }),
      });
      if (!resp.ok) throw new Error('Usuário ou senha inválidos');
      const data = await resp.json() as { token: string };
      setAdminToken(data.token);
      setAdminUser('');
      setAdminPass('');
      void handleAdminRefresh(data.token);
    } catch (err) {
      addToast('error', 'Falha no login admin', err instanceof Error ? err.message : 'Erro');
    } finally {
      setAdminLogging(false);
    }
  };

  const handleAdminRefresh = async (token?: string) => {
    const t = token ?? adminToken;
    if (!t) return;
    setAdminChecking(true);
    try {
      const headers = { Authorization: `Bearer ${t}` };
      const [statusResp, checkResp] = await Promise.all([
        fetch('/gerenciamento_banco/admin/status', { headers }),
        fetch('/gerenciamento_banco/admin/verificar-tudo', { headers }),
      ]);
      if (statusResp.ok) setAdminStatus(await statusResp.json() as Record<string, AdminFonteStatus>);
      if (checkResp.ok) setAdminVerificacao(await checkResp.json() as AdminFonteCheck[]);
    } catch { /* silently ignore */ } finally {
      setAdminChecking(false);
    }
  };

  const handleAdminAtualizar = async (fonteId: string) => {
    if (!adminToken || adminUpdating[fonteId]) return;
    setAdminUpdating(prev => ({ ...prev, [fonteId]: true }));
    try {
      const resp = await fetch(`/gerenciamento_banco/admin/atualizar/${fonteId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await resp.json() as { message?: string; error?: string };
      if (data.error) addToast('error', `Erro ao atualizar ${fonteId}`, data.error);
      else addToast('success', `Ingestão disparada: ${fonteId}`, data.message ?? 'Processo iniciado');
      void handleAdminRefresh();
    } catch (err) {
      addToast('error', 'Falha na atualização', err instanceof Error ? err.message : 'Erro');
    } finally {
      setAdminUpdating(prev => ({ ...prev, [fonteId]: false }));
    }
  };

  const FONTE_LABELS: Record<string, string> = {
    sicar: 'SICAR', prodes: 'PRODES', deter: 'DETER', queimadas: 'Queimadas',
    ucs: 'Unid. Conservação', tis: 'Terras Indígenas', assentamentos: 'Assentamentos', quilombolas: 'Quilombolas',
  };

  const asgRows = analiseASG ? [
    { eixo: 'Ambiental', indicador: 'Desmat. PRODES', valor: analiseASG.area_desmatada_ha != null ? `${analiseASG.area_desmatada_ha} ha` : '—' },
    { eixo: 'Ambiental', indicador: 'Déficit APP',    valor: analiseASG.deficit_app_ha != null ? `${analiseASG.deficit_app_ha} ha` : '—' },
    { eixo: 'Ambiental', indicador: 'Déficit RL',     valor: analiseASG.deficit_reserva_legal_ha != null ? `${analiseASG.deficit_reserva_legal_ha} ha` : '—' },
    { eixo: 'Social',    indicador: 'UCs',            valor: analiseASG.sobreposicao_uc ?? '—' },
    { eixo: 'Social',    indicador: 'TI',             valor: analiseASG.sobreposicao_ti ?? '—' },
    { eixo: 'Governança', indicador: 'CAR',           valor: propriedade?.status_imovel ?? '—' },
  ] : [];

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <main className="skeleton-page">
        <header className="shell shell-topbar">
          <div className="topbar-brand">
            <img src={logoMark} alt="Logo Stratos" className="brand-logo" />
            <span className="brand-title">Stratos</span>
          </div>

          <div className="topbar-actions" ref={menuRef}>
            <button type="button" className="theme-gear admin-btn" onClick={() => setAdminOpen(true)} aria-label="Painel Admin" title="Painel Admin">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round"/></svg>
            </button>
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
                placeholder="Pesquisar CAR"
                disabled={searching}
              />
              <button type="button" onClick={() => void handleSearch()} disabled={searching}>
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
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
              ] as { id: LayerId; label: string; color: string; count: number | null; unit: string }[]).map(({ id, label, color, count, unit }) => {
                const on = layerVisible[id];
                const dotClass = count === null ? 'is-checking' : count > 0 ? 'is-available' : 'is-unavailable';
                return (
                  <button
                    key={id}
                    className={`layer-btn${on ? ' layer-btn--on' : ''}`}
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
          <aside className="shell shell-right">
            <div className="right-split-panel">
              <section className="asg-report-panel">
                <header className="asg-report-header">
                  <h3>Reports ASG</h3>
                  <div className="asg-header-actions">
                    {resumoASG && (
                      <span className={`asg-risco-badge asg-risco-${resumoASG.nivel}`}>
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

                  {relatorioASG ? (
                    <div className="asg-indicadores">
                      {(['Ambiental', 'Social', 'Governança'] as const).map((cat) => {
                        const itens = relatorioASG.indicadores.filter(i => i.categoria === cat);
                        if (!itens.length) return null;
                        return (
                          <div key={cat} className="asg-categoria-group">
                            <span className="asg-categoria-label">{cat}</span>
                            {itens.map((ind, idx) => (
                              <div key={idx} className="asg-indicador-row">
                                <div className="asg-indicador-main">
                                  <span className="asg-indicador-nome">{ind.nome}</span>
                                  <span className={`asg-status-badge asg-status-${ind.status}`}>
                                    {ind.status === 'ok' ? 'OK' : ind.status === 'atencao' ? 'Atenção' : ind.status === 'critico' ? 'Crítico' : 'Pendente'}
                                  </span>
                                </div>
                                <div className="asg-indicador-valor">
                                  {ind.valor != null
                                    ? <strong>{ind.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {ind.unidade}</strong>
                                    : ind.detalhe
                                      ? <strong>{ind.detalhe}</strong>
                                      : <span>—</span>
                                  }
                                  {ind.valor != null && ind.detalhe && (
                                    <span className="asg-indicador-detalhe">{ind.detalhe}</span>
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
                    <div className="unavailable-panel">
                      <span className="unavailable-panel-icon">
                        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round"/></svg>
                      </span>
                      <div>
                        <strong>Relatório ASG</strong>
                        <p>Busque um imóvel pelo código CAR para visualizar os indicadores ASG.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="chat-placeholder">
                <header className="chat-placeholder-header">
                  <h3>Chat ASG</h3>
                  {propriedade && <span>{propriedade.cod_imovel}</span>}
                </header>
                <div className="chat-placeholder-body" ref={chatBodyRef}>
                  {chatMessages.map((m) => (
                    <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
                      {m.text.split('\n').map((line, i) => (
                        <span key={i}>{line}{i < m.text.split('\n').length - 1 && <br />}</span>
                      ))}
                    </div>
                  ))}
                  {chatSending && (
                    <div className="chat-bubble chat-bubble-incoming chat-bubble-typing">
                      <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
                    </div>
                  )}
                </div>
                <footer className="chat-placeholder-footer">
                  <input
                    type="text"
                    placeholder={propriedade ? 'Pergunte sobre esta propriedade...' : 'Busque um CAR primeiro...'}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSendChat(); }}
                    disabled={!propriedade || chatSending}
                  />
                  <button type="button" onClick={() => void handleSendChat()} disabled={!propriedade || !chatInput.trim() || chatSending}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z"/></svg>
                  </button>
                </footer>
              </section>
            </div>
          </aside>
        </section>
      </main>

      {adminOpen && (
        <div className="admin-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAdminOpen(false); }}>
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h2>Painel Admin</h2>
              <button className="admin-close-btn" onClick={() => setAdminOpen(false)} aria-label="Fechar">
                <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeWidth="2"/></svg>
              </button>
            </div>

            {!adminToken ? (
              <div className="admin-login-form">
                <p className="admin-login-desc">Acesso restrito. Insira as credenciais de administrador.</p>
                <input
                  type="text"
                  placeholder="Usuário"
                  value={adminUser}
                  onChange={(e) => setAdminUser(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAdminLogin(); }}
                  autoComplete="username"
                />
                <input
                  type="password"
                  placeholder="Senha"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAdminLogin(); }}
                  autoComplete="current-password"
                />
                <button
                  className="admin-action-btn admin-action-btn--primary"
                  onClick={() => void handleAdminLogin()}
                  disabled={adminLogging || !adminUser || !adminPass}
                >
                  {adminLogging ? 'Autenticando...' : 'Entrar'}
                </button>
              </div>
            ) : (
              <div className="admin-dashboard">
                <div className="admin-dash-toolbar">
                  <button
                    className="admin-action-btn admin-action-btn--secondary"
                    onClick={() => void handleAdminRefresh()}
                    disabled={adminChecking}
                  >
                    {adminChecking ? 'Verificando...' : 'Verificar Atualizações'}
                  </button>
                  <button
                    className="admin-action-btn admin-action-btn--ghost"
                    onClick={() => { setAdminToken(null); setAdminStatus(null); setAdminVerificacao(null); }}
                  >
                    Sair
                  </button>
                </div>

                <div className="admin-fontes-list">
                  {Object.entries(adminStatus ?? {}).map(([id, st]) => {
                    const check = adminVerificacao?.find(c => c.id === id);
                    const label = FONTE_LABELS[id] ?? id;
                    const isUpdating = adminUpdating[id] ?? false;
                    return (
                      <div key={id} className="admin-fonte-row">
                        <div className="admin-fonte-info">
                          <span className={`admin-fonte-dot admin-fonte-dot--${st.status}`} />
                          <span className="admin-fonte-label">{label}</span>
                          {check && (
                            <span className="admin-fonte-counts">
                              {check.total_local.toLocaleString('pt-BR')} local
                              {check.ha_novos_dados && (
                                <span className="admin-fonte-novos"> · {check.total_remoto.toLocaleString('pt-BR')} remoto</span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="admin-fonte-actions">
                          {check?.ha_novos_dados && (
                            <span className="admin-fonte-badge">Novo</span>
                          )}
                          {st.status === 'updating' || isUpdating ? (
                            <span className="admin-fonte-status admin-fonte-status--updating">Atualizando...</span>
                          ) : st.status === 'concluido' && !check?.ha_novos_dados ? (
                            <span className="admin-fonte-status admin-fonte-status--ok">Atualizado</span>
                          ) : (
                            <button
                              className="admin-action-btn admin-action-btn--small"
                              onClick={() => void handleAdminAtualizar(id)}
                            >
                              Atualizar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!adminStatus && !adminChecking && (
                    <p className="admin-empty-msg">Clique em "Verificar Atualizações" para ver o status dos bancos.</p>
                  )}
                  {adminChecking && (
                    <p className="admin-empty-msg">Consultando serviços...</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
