(() => {
  const STORAGE_KEY = 'busTracker.pastArrivals.v1';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const WEEK_LABEL = ['', '1주 전', '2주 전', '3주 전'];

  const state = {
    open: false,
    loading: false,
    error: null,
    payload: null,
    stationId: '',
    stationName: '',
    routeId: '',
    preferRouteIds: [],
    dow: 0,
    hour: 0,
    highlighted: null,
  };

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function kstParts(date = new Date()) {
    const raw = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    }).formatToParts(date);
    const pick = (type) => raw.find((p) => p.type === type)?.value;
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let hour = Number(pick('hour'));
    if (hour === 24) hour = 0;
    return {
      year: Number(pick('year')),
      month: Number(pick('month')),
      day: Number(pick('day')),
      hour,
      minute: Number(pick('minute')),
      dow: weekdayMap[pick('weekday')] ?? 0,
    };
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* quota */
    }
  }

  function storeKey(stationId, routeId) {
    return `${stationId}:${routeId}`;
  }

  function recordArrivals(stationId, arrivals) {
    if (!stationId || !Array.isArray(arrivals) || !arrivals.length) return;
    const now = Date.now();
    const store = loadStore();
    const cutoff = now - 80 * 86400000;
    for (const a of arrivals) {
      if (!a?.routeId || a.flag === 'STOP') continue;
      const sec = Number(a.etaSec1);
      if (!Number.isFinite(sec) || sec < 0 || sec > 90) continue;
      const t = now + sec * 1000;
      const key = storeKey(stationId, a.routeId);
      const list = Array.isArray(store[key]) ? store[key] : [];
      const dup = list.some((item) => Math.abs(item.t - t) < 3 * 60 * 1000);
      if (!dup) {
        list.push({
          t,
          seats: Number.isFinite(Number(a.remainSeat1)) ? Number(a.remainSeat1) : null,
        });
      }
      store[key] = list.filter((item) => item.t >= cutoff).slice(-400);
    }
    saveStore(store);
  }

  function observedTimes(stationId, routeId, isoDate, hour) {
    const list = loadStore()[storeKey(stationId, routeId)] || [];
    const start = Date.parse(`${isoDate}T${String(hour).padStart(2, '0')}:00:00+09:00`);
    const end = start + 2 * 60 * 60 * 1000;
    return list
      .filter((item) => item.t >= start && item.t < end)
      .map((item) => {
        const p = kstParts(new Date(item.t));
        const hhmm = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
        return { hhmm, min: p.hour * 60 + p.minute, last: false, predicted: false, seats: item.seats };
      })
      .sort((a, b) => a.min - b.min);
  }

  async function pullServerHistory(stationId, routeId) {
    if (!stationId || !routeId) return;
    try {
      const r = await fetch(
        `/api/history?stationId=${encodeURIComponent(stationId)}&routeId=${encodeURIComponent(routeId)}`
      );
      if (!r.ok) return;
      const data = await r.json();
      const store = loadStore();
      const key = storeKey(stationId, routeId);
      const list = Array.isArray(store[key]) ? store[key] : [];
      const cutoff = Date.now() - 80 * 86400000;
      for (const raw of data.arrivals || []) {
        const t = Number(raw);
        if (!Number.isFinite(t) || t < cutoff) continue;
        if (list.some((item) => Math.abs(item.t - t) < 2 * 60 * 1000)) continue;
        list.push({ t, seats: null });
      }
      store[key] = list.sort((a, b) => a.t - b.t).slice(-400);
      saveStore(store);
    } catch {
      /* offline / not deployed */
    }
  }

  function timesFromHour(times, hour) {
    const start = hour * 60;
    const end = start + 120;
    return (times || []).filter((t) => {
      const m = t.min % (24 * 60);
      return m >= start && m < end;
    });
  }

  function injectStyle() {
    if ($('#past-tt-style')) return;
    const style = document.createElement('style');
    style.id = 'past-tt-style';
    style.textContent = `
      .popup-timetable-btn {
        display: block;
        width: 100%;
        margin-top: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        background: rgba(90, 140, 255, 0.16);
        color: #d7e4ff;
        padding: 7px 8px;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .popup-timetable-btn:hover { background: rgba(90, 140, 255, 0.28); }
      #past-tt {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: none;
        background: #14171c;
        color: #f2f4f7;
        font-family: "IBM Plex Sans KR", sans-serif;
        padding-top: env(safe-area-inset-top);
        overflow-x: hidden;
      }
      #past-tt.open { display: flex; flex-direction: column; }
      #past-tt .tt-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }
      #past-tt .tt-top {
        display: grid;
        grid-template-columns: 44px 1fr 44px;
        align-items: center;
        padding: 10px 8px 6px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #past-tt .tt-top h2 {
        margin: 0;
        text-align: center;
        font-size: 16px;
        font-weight: 600;
      }
      #past-tt .tt-back, #past-tt .tt-spacer {
        width: 40px; height: 40px;
        border: 0; background: transparent; color: #f2f4f7;
        font-size: 22px; cursor: pointer;
      }
      #past-tt .tt-station {
        text-align: center;
        padding: 18px 20px 8px;
      }
      #past-tt .tt-station strong {
        display: block;
        font-size: 17px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      #past-tt .tt-station span {
        display: block;
        margin-top: 6px;
        color: #8b93a0;
        font-size: 12px;
      }
      #past-tt .tt-route {
        margin: 10px 18px 4px;
        position: relative;
      }
      #past-tt .tt-route-face {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        background: #1c2027;
        color: #f2f4f7;
        padding: 12px 40px 12px 12px;
        font-size: 16px;
        font-weight: 700;
        pointer-events: none;
      }
      #past-tt .tt-route select {
        position: absolute;
        inset: 0;
        width: 100%;
        opacity: 0;
        cursor: pointer;
        font-size: 16px;
      }
      #past-tt .tt-route::after {
        content: "▾";
        position: absolute;
        right: 14px; top: 50%;
        transform: translateY(-50%);
        color: #8b93a0;
        pointer-events: none;
      }
      #past-tt .tt-type {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        background: #e24b4b;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
      }
      #past-tt .tt-dows {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        margin: 12px 4px 0;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      #past-tt .tt-dows button {
        border: 0; background: transparent; color: #8b93a0;
        padding: 10px 0 12px; font: inherit; font-size: 13px; cursor: pointer;
        position: relative;
      }
      #past-tt .tt-dows button.on { color: #f2f4f7; font-weight: 600; }
      #past-tt .tt-dows button.on::after {
        content: "";
        position: absolute; left: 22%; right: 22%; bottom: 0;
        height: 2px; background: #f2f4f7;
      }
      #past-tt .tt-hours {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 14px 16px 8px;
        -webkit-overflow-scrolling: touch;
      }
      #past-tt .tt-hours button {
        flex: none;
        min-width: 58px;
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 999px;
        background: transparent;
        color: #d7dde5;
        padding: 8px 12px;
        font: inherit;
        font-size: 13px;
        cursor: pointer;
      }
      #past-tt .tt-hours button.on {
        background: #2f6dff;
        border-color: #2f6dff;
        color: #fff;
        font-weight: 700;
      }
      #past-tt .tt-note {
        margin: 8px 18px 16px;
        color: #8b93a0;
        font-size: 11px;
        line-height: 1.45;
        flex: none;
      }
      #past-tt .tt-grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        min-height: 0;
        overflow: auto;
      }
      #past-tt .tt-col {
        border-left: 1px solid rgba(255,255,255,0.06);
      }
      #past-tt .tt-col:first-child { border-left: 0; }
      #past-tt .tt-col-h {
        text-align: center;
        padding: 12px 6px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #past-tt .tt-col-h b { display: block; font-size: 13px; }
      #past-tt .tt-col-h i {
        display: block;
        margin-top: 4px;
        font-style: normal;
        color: #8b93a0;
        font-size: 11px;
      }
      #past-tt .tt-time {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 46px;
        font-size: 16px;
        font-variant-numeric: tabular-nums;
        color: #cfd6df;
      }
      #past-tt .tt-time.predicted { color: #9aa3af; }
      #past-tt .tt-time.on {
        background: #163a7a;
        color: #6ea8ff;
        font-weight: 700;
      }
      #past-tt .tt-time .mak {
        width: 18px; height: 18px;
        border-radius: 999px;
        background: #2f6dff;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #past-tt .tt-empty, #past-tt .tt-status {
        padding: 28px 20px;
        text-align: center;
        color: #8b93a0;
        font-size: 13px;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    injectStyle();
    let el = $('#past-tt');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'past-tt';
    el.innerHTML = `
      <div class="tt-top">
        <button type="button" class="tt-back" aria-label="닫기">‹</button>
        <h2>과거 시간표</h2>
        <span class="tt-spacer"></span>
      </div>
      <div class="tt-body"></div>
    `;
    document.body.appendChild(el);
    $('.tt-back', el).addEventListener('click', close);
    el.addEventListener('click', (e) => {
      const dowBtn = e.target.closest('[data-dow]');
      if (dowBtn) {
        state.dow = Number(dowBtn.getAttribute('data-dow'));
        pickDefaultHour();
        render();
        return;
      }
      const hourBtn = e.target.closest('[data-hour]');
      if (hourBtn) {
        state.hour = Number(hourBtn.getAttribute('data-hour'));
        state.highlighted = null;
        render();
        return;
      }
      const timeEl = e.target.closest('[data-hhmm]');
      if (timeEl) {
        state.highlighted = timeEl.getAttribute('data-hhmm');
        render();
      }
    });
    el.addEventListener('change', (e) => {
      if (e.target.id === 'ttRouteSelect') {
        state.routeId = e.target.value;
        load().catch(console.warn);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) close();
    });
    return el;
  }

  function pickDefaultHour() {
    const day = state.payload?.byDay?.[state.dow];
    const hours = day?.hours || [];
    if (!hours.length) {
      state.hour = kstParts().hour;
      return;
    }
    if (hours.includes(state.hour)) return;
    const nowH = kstParts().hour;
    state.hour = hours.includes(nowH)
      ? nowH
      : hours.reduce((best, h) => (Math.abs(h - nowH) < Math.abs(best - nowH) ? h : best), hours[0]);
  }

  function close() {
    state.open = false;
    $('#past-tt')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function render() {
    const root = ensureRoot();
    const body = $('.tt-body', root);
    const p = state.payload;
    const stationName = p?.station?.name || state.stationName || '정류장';
    const mobileNo = p?.station?.mobileNo || '';
    const direction = p?.station?.direction ? `${p.station.direction} 방면` : '';
    const metaBits = [mobileNo, direction].filter(Boolean).join(' · ');
    const routes = p?.routes || [];
    const selected = p?.selectedRoute || routes.find((r) => r.routeId === state.routeId);

    if (state.loading) {
      body.innerHTML = `<div class="tt-station"><strong>${escapeHtml(stationName)}</strong></div>
        <div class="tt-status">시간표를 불러오는 중…</div>`;
      root.classList.add('open');
      document.body.style.overflow = 'hidden';
      return;
    }
    if (state.error && !p) {
      body.innerHTML = `<div class="tt-station"><strong>${escapeHtml(stationName)}</strong></div>
        <div class="tt-status">${escapeHtml(state.error)}</div>`;
      root.classList.add('open');
      document.body.style.overflow = 'hidden';
      return;
    }

    const day = p?.byDay?.[state.dow] || { times: [], hours: [] };
    const hours = day.hours || [];
    const weekDates = p?.weekDates?.[state.dow] || [];
    const scheduleSlice = timesFromHour(day.times || [], state.hour);

    const columns = [1, 2, 3].map((weekAgo) => {
      const meta = weekDates.find((w) => w.weekAgo === weekAgo) || { label: '', iso: '' };
      const observed = observedTimes(state.stationId, state.routeId, meta.iso, state.hour);
      const times = observed.length ? observed : scheduleSlice;
      return { weekAgo, meta, times, observed: observed.length > 0 };
    });

    const rowCount = Math.max(1, ...columns.map((c) => c.times.length));
    if (state.highlighted == null && columns[0].times.length) {
      state.highlighted = columns[0].times[0].hhmm;
    }

    const routeOptions = routes.map((r) => {
      const label = `${r.typeShort || ''} ${r.routeName}`.trim();
      const sel = r.routeId === (p.selectedRouteId || state.routeId) ? 'selected' : '';
      return `<option value="${escapeHtml(r.routeId)}" ${sel}>${escapeHtml(label)}</option>`;
    }).join('');

    const type = selected?.typeShort || '버스';
    const routeName = selected?.routeName || '';

    body.innerHTML = `
      <div class="tt-station">
        <strong>${escapeHtml(stationName)}</strong>
        <span>${escapeHtml(metaBits)}</span>
      </div>
      <div class="tt-route">
        <div class="tt-route-face"><span class="tt-type">${escapeHtml(type)}</span>${escapeHtml(routeName)}</div>
        <select id="ttRouteSelect" aria-label="노선 선택">${routeOptions}</select>
      </div>
      <div class="tt-dows">
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => (
          `<button type="button" data-dow="${d}" class="${d === state.dow ? 'on' : ''}">${DOW[d]}</button>`
        )).join('')}
      </div>
      <div class="tt-hours">
        ${hours.length
          ? hours.map((h) => `<button type="button" data-hour="${h}" class="${h === state.hour ? 'on' : ''}">${h}시</button>`).join('')
          : '<div class="tt-status">운행 시각이 없습니다.</div>'}
      </div>
      <div class="tt-grid">
        ${columns.map((col) => `
          <div class="tt-col">
            <div class="tt-col-h"><b>${WEEK_LABEL[col.weekAgo]}</b><i>${escapeHtml(col.meta.label || '')}</i></div>
            ${Array.from({ length: rowCount }, (_, i) => {
              const t = col.times[i];
              if (!t) return `<div class="tt-time">&nbsp;</div>`;
              const on = t.hhmm === state.highlighted ? 'on' : '';
              const pred = t.predicted && !col.observed ? 'predicted' : '';
              const mak = t.last ? '<span class="mak">막</span>' : '';
              return `<div class="tt-time ${on} ${pred}" data-hhmm="${escapeHtml(t.hhmm)}">${escapeHtml(t.hhmm)}${mak}</div>`;
            }).join('')}
          </div>
        `).join('')}
      </div>
      <p class="tt-note">${escapeHtml(p?.note || '')}${day.error ? ` ${escapeHtml(day.error)}` : ''}</p>
    `;

    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    const hoursRow = root.querySelector('.tt-hours');
    const onHour = hoursRow?.querySelector('button.on');
    if (hoursRow && onHour) {
      hoursRow.scrollLeft = Math.max(0, onHour.offsetLeft - (hoursRow.clientWidth / 2) + (onHour.offsetWidth / 2));
    }
  }

  async function load() {
    state.loading = true;
    state.error = null;
    render();
    const qs = new URLSearchParams({
      stationId: state.stationId,
      routeId: state.routeId || '',
      preferRouteIds: state.preferRouteIds.join(','),
    });
    const r = await fetch(`/api/timetable?${qs.toString()}`);
    const data = await r.json();
    state.loading = false;
    if (data.error && !data.byDay) {
      state.error = data.error;
      state.payload = null;
      render();
      return;
    }
    state.payload = data;
    state.routeId = data.selectedRouteId || state.routeId;
    await pullServerHistory(state.stationId, state.routeId);
    const now = kstParts();
    state.dow = now.dow;
    state.hour = now.hour;
    pickDefaultHour();
    state.highlighted = null;
    render();
  }

  async function open(opts = {}) {
    ensureRoot();
    state.open = true;
    state.stationId = String(opts.stationId || '');
    state.stationName = opts.stationName || '정류장';
    state.routeId = opts.routeId ? String(opts.routeId) : '';
    state.preferRouteIds = Array.isArray(opts.preferRouteIds)
      ? opts.preferRouteIds.map(String)
      : String(opts.preferRouteIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    state.payload = null;
    await load();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-timetable]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    open({
      stationId: btn.getAttribute('data-station-id'),
      stationName: btn.getAttribute('data-station-name'),
      routeId: btn.getAttribute('data-route-id'),
      preferRouteIds: btn.getAttribute('data-prefer-route-ids'),
    }).catch(console.warn);
  });

  window.PastTimetable = { open, close, recordArrivals };
})();
