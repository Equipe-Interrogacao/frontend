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
  const [dbStatus, setDbStatus] = useState<DbStatus>('checking');
  const [dbMessage, setDbMessage] = useState('Verificando banco...');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'incoming', text: 'Olá! Busque uma propriedade pelo código CAR para consultas ASG.' }
  ]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const resultLayerRef = useRef<L.LayerGroup | null>(null);
  const neighborsLayerRef = useRef<L.LayerGroup | null>(null);

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
          setDbMessage(`Banco com ${String(p['total_sp'] ?? p['total'] ?? '?')} propriedades SP.`);
        } else {
          setDbStatus('unavailable');
          setDbMessage('Sem cache SP — busca ingere sob demanda.');
        }
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
    neighborsLayerRef.current = L.layerGroup().addTo(map);
    resultLayerRef.current = L.layerGroup().addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    return () => { map.remove(); mapRef.current = null; tileLayerRef.current = null; resultLayerRef.current = null; neighborsLayerRef.current = null; };
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

  // Busca
  const handleSearch = async () => {
    const query = searchValue.trim();
    const map = mapRef.current;
    const resultLayer = resultLayerRef.current;
    if (!map || !resultLayer || searching) return;

    resultLayer.clearLayers();
    neighborsLayerRef.current?.clearLayers();
    setPropriedade(null);
    setAnaliseASG(null);
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

        // Load neighbors in the same municipality (background layer)
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

      // Análise ASG
      try {
        const asgResp = await fetch(`/cruzamento_asg/asg/analises/${encodeURIComponent(cod)}`);
        if (asgResp.ok) {
          setAnaliseASG(await asgResp.json() as AnaliseASG);
          addToast('success', 'Análise ASG carregada');
        }
      } catch { /* sem ASG, não é crítico */ }

    } catch (err) {
      addToast('error', 'Erro de rede', err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSearching(false);
    }
  };

  // Chat
  const handleSendChat = async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatMessages((c) => [...c, { id: Date.now(), role: 'outgoing', text: msg }]);
    setChatInput('');
    try {
      const resp = await fetch('/busca_semantica/busca/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: msg, cod_car: propriedade?.cod_imovel ?? null }),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const data = await resp.json() as { resposta?: string };
      setChatMessages((c) => [...c, { id: Date.now() + 1, role: 'incoming', text: data.resposta ?? 'Sem resposta.' }]);
    } catch (err) {
      addToast('error', 'Erro no chat', err instanceof Error ? err.message : 'Falha ao consultar.');
      setChatMessages((c) => [...c, { id: Date.now() + 1, role: 'incoming', text: 'Erro ao consultar o serviço de busca.' }]);
    }
  };

  const asgRows = analiseASG ? [
    { eixo: 'Ambiental', indicador: 'APP',   valor: analiseASG.deficit_app_ha            != null ? `${analiseASG.deficit_app_ha} ha`            : '—' },
    { eixo: 'Ambiental', indicador: 'RL',    valor: analiseASG.deficit_reserva_legal_ha  != null ? `${analiseASG.deficit_reserva_legal_ha} ha`  : '—' },
    { eixo: 'Ambiental', indicador: 'DETER', valor: analiseASG.area_desmatada_ha         != null ? `${analiseASG.area_desmatada_ha} ha`         : '—' },
    { eixo: 'Social',    indicador: 'UCs',   valor: analiseASG.sobreposicao_uc  ?? '—' },
    { eixo: 'Social',    indicador: 'TI',    valor: analiseASG.sobreposicao_ti  ?? '—' },
    { eixo: 'Governança',indicador: 'CAR',   valor: propriedade?.status_imovel  ?? '—' },
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

              <div className="data-status-row" aria-live="polite">
                <div className="data-status-header">
                  <span className={`data-status-dot is-${dbStatus}`} />
                  <strong className="data-status-label">
                    SICAR-SP: {dbStatus === 'available' ? 'Disponível' : dbStatus === 'checking' ? 'Verificando...' : 'Sem cache'}
                  </strong>
                </div>
                <span className="data-status-message">{dbMessage}</span>
              </div>

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
                  <span>{propriedade?.cod_imovel ?? '—'}</span>
                </header>
                <div className="asg-report-content">
                  {propriedade?.status_imovel && (
                    <CarStatusBadge status={propriedade.status_imovel} />
                  )}
                  <div className="unavailable-panel">
                    <span className="unavailable-panel-icon">
                      <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round"/></svg>
                    </span>
                    <div>
                      <strong>Análise ASG indisponível</strong>
                      <p>O módulo de cruzamento ambiental, social e de governança ainda está em desenvolvimento.</p>
                    </div>
                    <button className="unavailable-btn" disabled>Em breve</button>
                  </div>
                </div>
              </section>

              <section className="chat-placeholder">
                <header className="chat-placeholder-header">
                  <h3>Chat ASG</h3>
                  {propriedade && <span>{propriedade.cod_imovel}</span>}
                </header>
                <div className="chat-placeholder-body">
                  <div className="unavailable-panel">
                    <span className="unavailable-panel-icon">
                      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </span>
                    <div>
                      <strong>Chatbot indisponível</strong>
                      <p>O assistente de linguagem natural para consultas ASG ainda está em desenvolvimento.</p>
                    </div>
                    <button className="unavailable-btn" disabled>Em breve</button>
                  </div>
                </div>
                <footer className="chat-placeholder-footer is-disabled">
                  <input type="text" placeholder="Indisponível no momento..." disabled />
                  <button type="button" disabled>Enviar</button>
                </footer>
              </section>
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
