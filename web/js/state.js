// OpenHongguo Web - Application State & DOM References

export const state = {
  channel: '推荐',
  searchQuery: '',
  searchFilter: '',
  isLoadingCatalog: false,

  // Cursor Pagination Stack (fast in-memory navigation)
  currentPage: 1,
  pageStack: [], // Array of { items: [...], cursor: '...', hasMore: boolean }

  // Search History (recent 5 records)
  searchHistory: [],

  // Active Theater Playback
  currentSeries: null,
  episodes: [],
  currentEpIndex: 0,
  currentQuality: '720p',
  autoplay: true,

  // History & Tools
  history: [],
  tools: {},
  historyOpen: false,

  // Cache Window State
  cachedEpIDs: new Set(),
  cacheWindowTimer: null,
  loadingTimer: null,
};

export const el = {
  // Views
  viewCatalog: document.getElementById('view-catalog'),
  viewTheater: document.getElementById('view-theater'),

  // Catalog Section
  seriesGrid: document.getElementById('series-grid'),
  gridLoader: document.getElementById('grid-loader'),
  gridEmpty: document.getElementById('grid-empty'),
  channelTitle: document.getElementById('current-channel-title'),
  channelSubtitle: document.getElementById('channel-subtitle'),
  catalogFilters: document.getElementById('catalog-filters'),

  // Header & Navigation
  navChannels: document.getElementById('nav-channels'),
  searchInput: document.getElementById('search-input'),
  searchClear: document.getElementById('search-clear'),
  searchSubmit: document.getElementById('search-submit'),
  searchHistoryDropdown: document.getElementById('search-history-dropdown'),
  searchHistoryTags: document.getElementById('search-history-tags'),
  btnClearSearchHistory: document.getElementById('btn-clear-search-history'),
  btnHome: document.getElementById('btn-home'),

  // Cursor Pagination Controls
  paginationContainer: document.getElementById('pagination-container'),
  pgCurrentPage: document.getElementById('pg-current-page'),
  btnPagePrev: document.getElementById('btn-page-prev'),
  btnPageNext: document.getElementById('btn-page-next'),

  // History Drawer
  btnHistoryToggle: document.getElementById('btn-history-toggle'),
  historyDrawer: document.getElementById('history-drawer'),
  drawerOverlay: document.getElementById('drawer-overlay'),
  btnCloseHistory: document.getElementById('btn-close-history'),
  btnClearHistory: document.getElementById('btn-clear-history'),
  historyList: document.getElementById('history-list'),

  // System Status
  systemStatus: document.getElementById('system-status-indicator'),

  // Theater / Player Elements
  artplayerContainer: document.getElementById('artplayer-container'),
  videoLoading: document.getElementById('video-loading'),
  videoLoadingMsg: document.getElementById('video-loading-msg'),
  playerTitle: document.getElementById('player-title'),
  btnPlayerBack: document.getElementById('btn-player-back'),
  btnEpPrev: document.getElementById('btn-ep-prev'),
  btnEpNext: document.getElementById('btn-ep-next'),
  chkAutoplay: document.getElementById('chk-autoplay'),
  selectQuality: document.getElementById('select-quality'),
  btnPlayExternal: document.getElementById('btn-play-external'),
  btnDownloadEp: document.getElementById('btn-download-ep'),

  // Series Detail Sidebar
  theaterSeriesCover: document.getElementById('theater-series-cover'),
  theaterSeriesTitle: document.getElementById('theater-series-title'),
  theaterEpCount: document.getElementById('theater-ep-count'),
  theaterHeat: document.getElementById('theater-heat'),
  theaterSeriesTags: document.getElementById('theater-series-tags'),
  theaterSeriesSummary: document.getElementById('theater-series-summary'),
  epTotalLabel: document.getElementById('ep-total-label'),
  cacheStatusBar: document.getElementById('cache-status-bar'),
  cacheStatusText: document.getElementById('cache-status-text'),
  epRangeTabs: document.getElementById('ep-range-tabs'),
  episodesGrid: document.getElementById('episodes-grid'),

  toastContainer: document.getElementById('toast-container'),
};
