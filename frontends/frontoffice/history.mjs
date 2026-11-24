import { chartMarkup, downloadCSV, escapeHTML as h, formatTime } from '../shared/ui.mjs';
import { paginate } from '../shared/domain.mjs';

export function createHistoryModel(adapter, { onChange = () => {}, onSessionExpired = () => {} } = {}) {
  let state = { status: 'idle', rows: [], origin: adapter.mode, error: '' };
  let revision = 0, pending = null;
  const set = value => { state = { ...state, ...value }; onChange(state); };
  return {
    getState: () => state,
    async load() {
      const current = ++revision;
      pending?.abort(); pending = new AbortController();
      set({ status: 'loading', rows: [], error: '' });
      try {
        const result = await adapter.getMeasurements({ signal: pending.signal });
        if (current !== revision) return;
        set({ status: result.rows.length ? 'ready' : 'empty', rows: result.rows, origin: result.origin });
      } catch (error) {
        if (current !== revision) return;
        if (error.code === 'SESSION_EXPIRED') {
          set({ status: 'expired', rows: [], error: error.message });
          onSessionExpired(error.message);
        } else set({ status: 'error', rows: [], error: error.message });
      }
    },
    reset() {
      ++revision; pending?.abort(); pending = null;
      set({ status: 'idle', rows: [], error: '' });
    }
  };
}

export function historyStatus(state) {
  return {
    originLabel: state.origin === 'demo'
      ? 'FICTIONAL DEMO · JSON example response, fixed example dates. No server health data.'
      : 'Measurements saved to your account.',
    message: {
      idle: 'Sign in to load measurement history.',
      loading: 'Loading measurements…',
      ready: '',
      empty: 'No measurements are available yet.',
      error: state.error,
      expired: 'Your session has expired. Returning to sign in…'
    }[state.status],
    canRetry: state.status === 'error',
    showContent: state.status === 'ready'
  };
}

export function selectHistoryRows(rows, { range = 'all', quality = 'all', end = Date.now() } = {}) {
  let start = 0;
  if (range === 'today') { const date = new Date(end); date.setHours(0, 0, 0, 0); start = date.getTime(); }
  else if (range !== 'all') start = end - Number(range) * 60000;
  return rows.filter(row => (range === 'all' || (row.timestamp >= start && row.timestamp <= end)) &&
    (quality === 'all' || row.quality === quality));
}

export function mountHistory(element, { adapter, onSessionExpired, now = () => Date.now() }) {
  const $ = selector => element.querySelector(selector);
  let page = 1, end = now();
  let selected = [];
  const model = createHistoryModel(adapter, { onChange: render, onSessionExpired });
  const listeners = [];
  function listen(target, event, callback) {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  }
  function render(state) {
    const status = historyStatus(state);
    element.setAttribute('aria-busy', String(state.status === 'loading'));
    element.dataset.historyState = state.status;
    $('#history-origin').textContent = status.originLabel;
    $('#history-message').textContent = status.message;
    $('#history-feedback').hidden = !status.message;
    $('#history-retry').hidden = !status.canRetry;
    $('#history-refresh').disabled = state.status === 'loading';
    $('#history-content').hidden = !status.showContent;
    selected = selectHistoryRows(state.rows, {
      range: $('#history-range').value, quality: $('#history-quality').value, end
    });
    $('[data-export]').disabled = !status.showContent || !selected.length;
    const current = paginate(selected, page);
    page = current.page;
    $('#history-body').innerHTML = current.rows.length ? current.rows.map(reading =>
      '<tr><td>' + h(formatTime(reading.timestamp)) + '</td><td>' + h(reading.hr == null ? '—' : reading.hr + ' bpm') +
      '</td><td>' + h(reading.spo2 == null ? '—' : reading.spo2 + '%') + '</td><td>' +
      '<span class="status-chip' + (reading.quality !== 'good' ? ' warning' : '') + '">' +
      h(reading.quality === 'good' ? 'Good signal' : 'Invalid signal') +
      '</span></td><td>' + h(reading.source) + '</td></tr>').join('') :
      '<tr><td colspan="5">No readings match these filters.</td></tr>';
    $('#history-total').textContent = selected.length + ' selected readings · oldest to newest';
    $('#page-label').textContent = 'Page ' + current.page + ' of ' + current.pages;
    $('#previous-page').disabled = current.page <= 1;
    $('#next-page').disabled = current.page >= current.pages;
    const chartEnd = selected.length ? selected[selected.length - 1].timestamp + 1000 : end;
    const chartStart = selected.length ? selected[0].timestamp - 1000 : chartEnd - 900000;
    for (const metric of ['hr', 'spo2']) {
      $('[data-history-chart="' + metric + '"]').innerHTML = status.showContent
        ? chartMarkup(selected, metric, chartEnd, Math.max(1000, chartEnd - chartStart) / 60000) : '';
    }
  }
  async function load() {
    page = 1;
    await model.load();
    const state = model.getState();
    end = state.origin === 'demo' && state.rows.length ? state.rows[state.rows.length - 1].timestamp : now();
    render(state);
  }
  for (const id of ['#history-range', '#history-quality']) listen($(id), 'change', () => { page = 1; render(model.getState()); });
  listen($('#history-retry'), 'click', load);
  listen($('#history-refresh'), 'click', load);
  listen($('#previous-page'), 'click', () => { --page; render(model.getState()); });
  listen($('#next-page'), 'click', () => { ++page; render(model.getState()); });
  listen($('[data-export]'), 'click', () => { if (selected.length) downloadCSV(selected, 'smartcare-history.csv'); });
  render(model.getState());
  return {
    load,
    reset() {
      page = 1; $('#history-range').value = 'all'; $('#history-quality').value = 'all';
      model.reset();
    },
    dispose() { model.reset(); listeners.forEach(remove => remove()); }
  };
}
