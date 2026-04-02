import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import logoMark from './static/logostratos.png';
import { asgReportSample } from './data/asgReportSample';

type ThemeMode = 'light' | 'dark';

type ChatRole = 'incoming' | 'outgoing';

type ChatMessage = {
  id: number;
  role: ChatRole;
  text: string;
};

type SicarDemonstrativoResult = {
  codigoImovel?: string;
  situacaoImovel?: string;
  descricaoEtapaCadastro?: string;
  areaTotalImovel?: string;
  municipio?: string;
  unidadeFederativa?: string;
  poligonoAreaImovel?: string;
};

type SicarSpDataStatus = 'checking' | 'available' | 'unavailable';
type CarDataSource = 'placeholder' | 'real';


const THEME_STORAGE_KEY = 'stratos-theme';
const SICAR_API_BASE_URL = 'https://apigateway.conectagov.estaleiro.serpro.gov.br/api-sicar-demonstrativo/v1';
const GERENCIAMENTO_BANCO_HEALTH_URL = import.meta.env.VITE_GERENCIAMENTO_BANCO_HEALTH_URL ?? '/gerenciamento_banco/health';
const PLACEHOLDER_CAR_DB: Array<{ codigoImovel: string; poligono: Array<[number, number]>; municipio: string; unidadeFederativa: string }> = [
  {
    codigoImovel: 'SP-PLACEHOLDER-0001',
    poligono: [
      [-23.5601, -46.6692],
      [-23.5581, -46.6635],
      [-23.5648, -46.6605],
      [-23.5681, -46.6668],
      [-23.5651, -46.6718],
      [-23.5601, -46.6692]
    ],
    municipio: 'São Paulo',
    unidadeFederativa: 'SP'
  },
  {
    codigoImovel: 'SP-PLACEHOLDER-0002',
    poligono: [
      [-22.9128, -47.0693],
      [-22.9095, -47.0636],
      [-22.9159, -47.0604],
      [-22.9202, -47.0658],
      [-22.9174, -47.0714],
      [-22.9128, -47.0693]
    ],
    municipio: 'Campinas',
    unidadeFederativa: 'SP'
  }
];

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1 ? true : value === 0 ? false : null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'sim', 'yes', 'ok', 'ready', 'available'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'nao', 'não', 'no', 'unavailable', 'not_ready'].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function resolveSicarSpAvailability(payload: unknown): boolean | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const directKeys = [
    'sicarSpDisponivel',
    'sicar_sp_disponivel',
    'dadosSicarSpDisponiveis',
    'dadosSicarSpCarregados',
    'sicarSpLoaded',
    'sicarLoaded',
    'ready'
  ];

  for (const key of directKeys) {
    const parsed = normalizeBoolean(root[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  const nestedCandidates = [root.data, root.status, root.health, root.result];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const nested = candidate as Record<string, unknown>;

    for (const key of directKeys) {
      const parsed = normalizeBoolean(nested[key]);

      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
}


function parseWktPolygon(wkt: string): Array<[number, number]> | null {
  const normalized = wkt.trim();
  const polygonMatch = normalized.match(/^(?:POLYGON\s*)?\(\(\((.*)\)\)\)$/i);

  if (!polygonMatch) {
    return null;
  }

  const coordinates = polygonMatch[1]
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter((pair) => pair.length >= 2 && pair.every(Number.isFinite))
    .map(([lng, lat]) => [lat, lng] as [number, number]);

  if (coordinates.length < 3) {
    return null;
  }

  const [firstLat, firstLng] = coordinates[0];
  const [lastLat, lastLng] = coordinates[coordinates.length - 1];

  if (firstLat !== lastLat || firstLng !== lastLng) {
    coordinates.push([firstLat, firstLng]);
  }

  return coordinates;
}


function parseCoordinates(input: string): [number, number] | null {
  const normalized = input.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return [lat, lng];
}

function normalizeCarCode(input: string): string {
  return input.trim().toUpperCase();
}

function getInitialTheme(): ThemeMode {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return 'light';
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchFeedback, setSearchFeedback] = useState('');
  const [searchDetails, setSearchDetails] = useState<SicarDemonstrativoResult | null>(null);
  const [selectedCarDataSource, setSelectedCarDataSource] = useState<CarDataSource>('placeholder');
  const [sicarSpDataStatus, setSicarSpDataStatus] = useState<SicarSpDataStatus>('checking');
  const [sicarSpStatusMessage, setSicarSpStatusMessage] = useState('Verificando dados do SICAR-SP no banco...');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'incoming', text: 'Olá! Este espaço será usado para mensagens operacionais.' }
  ]);
  const menuRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const resultLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;

    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }

    favicon.href = logoMark;
  }, []);

  useEffect(() => {
    let isActive = true;
    const abortController = new AbortController();

    const checkSicarSpDataHealth = async () => {
      try {
        const response = await fetch(GERENCIAMENTO_BANCO_HEALTH_URL, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`health status ${response.status}`);
        }

        const payload = (await response.json()) as unknown;
        const availability = resolveSicarSpAvailability(payload);

        if (!isActive) {
          return;
        }

        if (availability === true) {
          setSicarSpDataStatus('available');
          setSicarSpStatusMessage('Dados do SICAR-SP disponíveis no banco.');
          return;
        }

        setSicarSpDataStatus('unavailable');
        setSicarSpStatusMessage('Dados do SICAR-SP ainda não estão carregados no banco.');
      } catch (error) {
        if (!isActive || abortController.signal.aborted) {
          return;
        }

        setSicarSpDataStatus('unavailable');
        setSicarSpStatusMessage('Não foi possível confirmar o status do SICAR-SP no gerenciamento_banco.');
      }
    };

    void checkSicarSpDataHealth();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: [-14.235, -51.9253],
      zoom: 4,
      zoomControl: false
    });

    mapRef.current = map;
    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    resultLayerRef.current = L.layerGroup().addTo(map);

    L.control
      .zoom({
        position: 'bottomright'
      })
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      resultLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) {
      return;
    }

    const map = mapRef.current;
    const previousTileLayer = tileLayerRef.current;

    map.removeLayer(previousTileLayer);

    const nextTileLayer =
      theme === 'dark'
        ? L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap &copy; CARTO'
          })
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
          });

    nextTileLayer.addTo(map);
    tileLayerRef.current = nextTileLayer;
  }, [theme]);

  const handleSearch = () => {
    const query = searchValue.trim();
    const map = mapRef.current;
    const resultLayer = resultLayerRef.current;

    if (!map || !resultLayer) {
      return;
    }

    resultLayer.clearLayers();
    setSearchDetails(null);

    if (!query) {
      setSearchFeedback('');
      return;
    }

    const parsedCoordinates = parseCoordinates(query);

    if (parsedCoordinates) {
      const [lat, lng] = parsedCoordinates;

      L.circleMarker([lat, lng], {
        radius: 8,
        color: '#1263a8',
        fillColor: '#41b0e4',
        fillOpacity: 0.9,
        weight: 2
      })
        .bindPopup(`Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        .addTo(resultLayer)
        .openPopup();

      map.flyTo([lat, lng], 14, { duration: 0.7 });
      setSearchFeedback('Coordenadas localizadas com sucesso.');
      return;
    }

    const normalizedCar = normalizeCarCode(query);

    if (selectedCarDataSource === 'placeholder') {
      const placeholderResult = PLACEHOLDER_CAR_DB.find((item) => normalizeCarCode(item.codigoImovel) === normalizedCar);

      if (!placeholderResult) {
        setSearchFeedback('CAR não encontrado na base placeholder.');
        return;
      }

      const polygon = L.polygon(placeholderResult.poligono, {
        color: '#0d3e92',
        weight: 3,
        fillColor: '#2aa7d9',
        fillOpacity: 0.24,
        lineJoin: 'round'
      }).addTo(resultLayer);

      polygon.bindPopup(
        [
          `CAR: ${placeholderResult.codigoImovel}`,
          'Fonte: Placeholder estático',
          `Local: ${placeholderResult.municipio}/${placeholderResult.unidadeFederativa}`
        ].join('<br />')
      );

      map.fitBounds(polygon.getBounds(), { padding: [34, 34] });
      setSearchDetails({
        codigoImovel: placeholderResult.codigoImovel,
        municipio: placeholderResult.municipio,
        unidadeFederativa: placeholderResult.unidadeFederativa,
        situacaoImovel: 'Demonstrativo de testes'
      });
      setSearchFeedback('CAR encontrado e desenhado a partir da base placeholder.');
      return;
    }

    if (sicarSpDataStatus !== 'available') {
      setSearchFeedback('Fonte real selecionada, mas os dados do SICAR-SP ainda estão indisponíveis.');
      return;
    }

    const token = localStorage.getItem('stratos-sicar-token')?.trim();

    setSearchFeedback('Consultando a API do SICAR...');

    void fetch(`${SICAR_API_BASE_URL}/${encodeURIComponent(normalizedCar)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Falha na consulta: ${response.status}`);
        }

        return (await response.json()) as { results?: SicarDemonstrativoResult[] };
      })
      .then((payload) => {
        const item = payload.results?.[0];

        if (!item?.poligonoAreaImovel) {
          throw new Error('A API não retornou o polígono do imóvel.');
        }

        const polygonCoordinates = parseWktPolygon(item.poligonoAreaImovel);

        if (!polygonCoordinates) {
          throw new Error('Não foi possível interpretar o polígono retornado pela API.');
        }

        const polygon = L.polygon(polygonCoordinates, {
          color: '#0d3e92',
          weight: 3,
          fillColor: '#2aa7d9',
          fillOpacity: 0.22,
          lineJoin: 'round'
        }).addTo(resultLayer);

        const popupLines = [
          item.codigoImovel ? `CAR: ${item.codigoImovel}` : null,
          item.situacaoImovel ? `Situação: ${item.situacaoImovel}` : null,
          item.municipio && item.unidadeFederativa ? `Local: ${item.municipio}/${item.unidadeFederativa}` : null,
          item.areaTotalImovel ? `Área total: ${item.areaTotalImovel}` : null,
          item.descricaoEtapaCadastro ? `Etapa: ${item.descricaoEtapaCadastro}` : null
        ].filter(Boolean) as string[];

        polygon.bindPopup(popupLines.join('<br />'));

        map.fitBounds(polygon.getBounds(), { padding: [34, 34] });
        setSearchDetails(item);
        setSearchFeedback('CAR encontrado e desenhado no mapa a partir da API do SICAR.');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Erro desconhecido ao consultar a API.';
        setSearchFeedback(`Não foi possível consultar o CAR: ${message}`);
      });
  };

  const isCarSearchEnabled = selectedCarDataSource === 'placeholder' || sicarSpDataStatus === 'available';
  const placeholderDataStatusLabel = 'Dados disponíveis';
  const placeholderDataStatusMessage = 'Base estática de demonstração ativa para testes.';
  const realDataStatusLabel = sicarSpDataStatus === 'available' ? 'Dados disponíveis' : 'Dados indisponíveis';
  const realDataStatusDot = sicarSpDataStatus === 'available' ? 'available' : 'unavailable';
  const asgTableRows = [
    { eixo: 'Ambiental', indicador: 'APP', valor: asgReportSample.ambiental.app },
    { eixo: 'Ambiental', indicador: 'RL', valor: asgReportSample.ambiental.rl },
    { eixo: 'Ambiental', indicador: 'DETER', valor: asgReportSample.ambiental.deter },
    { eixo: 'Ambiental', indicador: 'Focos', valor: asgReportSample.ambiental.focos },
    { eixo: 'Social', indicador: 'UCs', valor: asgReportSample.social.ucsSobreposicao },
    { eixo: 'Social', indicador: 'TI', valor: asgReportSample.social.tiSobreposicao },
    { eixo: 'Governança', indicador: 'CAR', valor: asgReportSample.governanca.carStatus },
    { eixo: 'Governança', indicador: 'INCRA', valor: asgReportSample.governanca.incraStatus }
  ];

  const handleSendChatMessage = () => {
    const message = chatInput.trim();

    if (!message) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'outgoing',
      text: message
    };

    const botMessage: ChatMessage = {
      id: Date.now() + 1,
      role: 'incoming',
      text: 'Chat em construção.'
    };

    setChatMessages((current) => [...current, userMessage, botMessage]);
    setChatInput('');
  };

  return (
    <main className="skeleton-page">
      <header className="shell shell-topbar">
        <div className="topbar-brand" aria-label="Stratos">
          <img src={logoMark} alt="Logo Stratos" className="brand-logo" />
          <span className="brand-title">Stratos</span>
        </div>

        <div className="topbar-actions" ref={menuRef}>
          <button
            type="button"
            className="theme-gear"
            onClick={() => setIsThemeMenuOpen((currentState) => !currentState)}
            aria-label="Abrir configuracoes de tema"
            aria-expanded={isThemeMenuOpen}
            aria-haspopup="dialog"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.5 7.5 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.5 7.5 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.63l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
            </svg>
          </button>

          {isThemeMenuOpen ? (
            <div className="theme-popup" role="dialog" aria-label="Configuração de tema">
              <div className="theme-switch-row">
                <button
                  id="theme-mode-switch"
                  type="button"
                  role="switch"
                  aria-checked={theme === 'dark'}
                  className={`theme-switch ${theme === 'dark' ? 'is-dark' : ''}`}
                  onClick={toggleTheme}
                >
                  <span className="theme-switch-icon" aria-hidden="true">
                    {theme === 'dark' ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M12.1 2.2a1 1 0 0 0-1.1 1.2 8 8 0 0 1-8.4 9.8 1 1 0 0 0-.8 1.6A10 10 0 1 0 12.1 2.2Z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M12 4.2a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0V5.2a1 1 0 0 1 1-1Zm0 12.5a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0v-1.1a1 1 0 0 1 1-1Zm7.8-5.7a1 1 0 0 1 1 1 1 1 0 0 1-1 1h-1.1a1 1 0 1 1 0-2h1.1ZM6.3 11a1 1 0 1 1 0 2H5.2a1 1 0 1 1 0-2h1.1Zm9.3-4.9a1 1 0 0 1 1.4 0l.8.8a1 1 0 1 1-1.4 1.4l-.8-.8a1 1 0 0 1 0-1.4ZM7.2 14.6a1 1 0 0 1 1.4 0 1 1 0 0 1 0 1.4l-.8.8a1 1 0 0 1-1.4-1.4l.8-.8Zm9.2 2a1 1 0 0 1-1.4 0l-.8-.8a1 1 0 1 1 1.4-1.4l.8.8a1 1 0 0 1 0 1.4ZM8.6 8.2a1 1 0 1 1-1.4-1.4l.8-.8A1 1 0 1 1 9.4 7.4l-.8.8ZM12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" />
                      </svg>
                    )}
                  </span>
                  <span className="theme-switch-thumb" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <section className="skeleton-grid">
        <aside className="shell shell-left" aria-label="Status dos dados">
          <section className="left-status-panel">
            <h3 className="left-status-title">Status de dados</h3>

            <div className="data-status-row" aria-live="polite">
              <span className="data-status-dot is-available" />
              <strong className="data-status-label">Placeholder estático: {placeholderDataStatusLabel}</strong>
              <span className="data-status-message">{placeholderDataStatusMessage}</span>
            </div>

            <div className="data-status-row" aria-live="polite">
              <span className={`data-status-dot is-${realDataStatusDot}`} />
              <strong className="data-status-label">Dados reais (SICAR-SP): {realDataStatusLabel}</strong>
              <span className="data-status-message">{sicarSpStatusMessage}</span>
            </div>

            <div className="data-source-selector" role="radiogroup" aria-label="Selecionar fonte de dados para busca por CAR">
              <span className="data-source-title">Fonte da busca CAR</span>
              <label className={`data-source-option ${selectedCarDataSource === 'placeholder' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="car-data-source"
                  checked={selectedCarDataSource === 'placeholder'}
                  onChange={() => setSelectedCarDataSource('placeholder')}
                />
                <span>Placeholder (teste)</span>
              </label>
              <label className={`data-source-option ${selectedCarDataSource === 'real' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="car-data-source"
                  checked={selectedCarDataSource === 'real'}
                  onChange={() => setSelectedCarDataSource('real')}
                />
                <span>Dados reais (SICAR-SP)</span>
              </label>
            </div>
          </section>
        </aside>

        <section className="shell shell-center" aria-label="Mapa">
          <div className="map-search-box">
            <input
              type="text"
              value={searchValue}
              disabled={!isCarSearchEnabled}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSearch();
                }
              }}
              placeholder={
                isCarSearchEnabled
                  ? selectedCarDataSource === 'placeholder'
                    ? 'Pesquisar CAR placeholder ou coordenadas'
                    : 'Pesquisar CAR real ou coordenadas'
                  : 'Busca por CAR bloqueada para a fonte real'
              }
              aria-label="Pesquisar CAR ou coordenadas"
            />
            <button type="button" onClick={handleSearch} disabled={!isCarSearchEnabled}>
              Buscar
            </button>
          </div>

          <p className="map-feedback">{searchFeedback}</p>

          {searchDetails ? (
            <div className="map-details" aria-live="polite">
              {searchDetails.codigoImovel ? <span><strong>CAR</strong> {searchDetails.codigoImovel}</span> : null}
              {searchDetails.situacaoImovel ? <span><strong>Situação</strong> {searchDetails.situacaoImovel}</span> : null}
              {searchDetails.municipio || searchDetails.unidadeFederativa ? (
                <span>
                  <strong>Local</strong> {searchDetails.municipio}{searchDetails.municipio && searchDetails.unidadeFederativa ? '/' : ''}{searchDetails.unidadeFederativa}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="map-stage">
            <div ref={mapContainerRef} id="map-root" className="shell-map" />

            {!isCarSearchEnabled ? (
              <div className="map-overlay-warning" role="status" aria-live="polite">
                A fonte real está indisponível no momento. Selecione Placeholder para testar agora.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="shell shell-right" aria-label="Painel ASG">
          <div className="right-split-panel">
            <section className="asg-report-panel" aria-label="Reports ASG">
              <header className="asg-report-header">
                <h3>Reports ASG</h3>
                <span>{asgReportSample.indicador}</span>
              </header>

              <div className="asg-report-content">
                <table className="asg-report-table">
                  <thead>
                    <tr>
                      <th>Eixo</th>
                      <th>Indicador</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asgTableRows.map((row) => (
                      <tr key={`${row.eixo}-${row.indicador}`}>
                        <td>{row.eixo}</td>
                        <td>{row.indicador}</td>
                        <td>{row.valor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="chat-placeholder" aria-label="Chat ASG">
              <header className="chat-placeholder-header">
                <h3>Chat ASG</h3>
                <span>Em construção</span>
              </header>

              <div className="chat-placeholder-body" aria-live="polite">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-bubble ${message.role === 'incoming' ? 'chat-bubble-incoming' : 'chat-bubble-outgoing'}`}
                  >
                    {message.text}
                  </div>
                ))}
              </div>

              <footer className="chat-placeholder-footer">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSendChatMessage();
                    }
                  }}
                  placeholder="Digite sua mensagem..."
                  aria-label="Campo de mensagem"
                />
                <button type="button" onClick={handleSendChatMessage}>
                  Enviar
                </button>
              </footer>
            </section>
          </div>
        </aside>
      </section>
    </main>
  );
}
