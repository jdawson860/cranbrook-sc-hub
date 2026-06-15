// WELLNESS VIEW
// ═══════════════════════════════════════════════════
async function loadWellnessView() {
  destroyCharts();
  const el = document.getElementById('mainContent');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Loading wellness data…</div>';

  try {
    const res = await fetch(API_WELL, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    const data = await res.json();

    const latest  = data.latest  || [];
    const series  = data.series  || [];
    const lowList = data.low_readiness || [];
    const avgR    = data.squad_avg_readiness;

    // --- Summary stats ---
    const totalCheckins = series.length;
    const today = new Date().toISOString().slice(0,10);
    const checkedInToday = latest.filter(w => w.date === today).length;

    const readinessColor = (s) => s >= 7 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#e63946';
    const readinessLabel = (s) => s >= 7 ? 'Good' : s >= 5 ? 'Moderate' : 'Low';
    const metricBar = (val, max=10, color='#3b82f6') => {
      const pct = Math.round((val/max)*100);
      return `<div style="background:#e5e7eb;border-radius:4px;height:6px;flex:1">
        <div style="background:${color};width:${pct}%;height:100%;border-radius:4px;transition:width .4s"></div>
      </div>`;
    };

    // --- Build squad readiness table ---
    let tableRows = '';
    if (latest.length === 0) {
      tableRows = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">No wellness check-ins yet — athletes submit via the Athlete Hub</td></tr>`;
    } else {
      latest.forEach(w => {
        const rs = w.readiness_score ?? '—';
        const rColor = typeof rs === 'number' ? readinessColor(rs) : '#aaa';
        const rLabel = typeof rs === 'number' ? readinessLabel(rs) : '—';
        const daysAgo = w.date ? Math.round((new Date() - new Date(w.date)) / 86400000) : '?';
        const daysStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
        tableRows += `<tr>
          <td class="athlete-name">${w.athlete}</td>
          <td><span style="font-size:18px;font-weight:800;color:${rColor}">${rs}</span><span style="font-size:11px;color:var(--muted)">/10</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:12px;font-weight:600;width:20px">${w.sleep ?? '—'}</span>
              ${typeof w.sleep === 'number' ? metricBar(w.sleep, 10, '#3b82f6') : ''}
            </div>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:12px;font-weight:600;width:20px">${w.soreness ?? '—'}</span>
              ${typeof w.soreness === 'number' ? metricBar(w.soreness, 10, '#e63946') : ''}
            </div>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:12px;font-weight:600;width:20px">${w.motivation ?? '—'}</span>
              ${typeof w.motivation === 'number' ? metricBar(w.motivation, 10, '#22c55e') : ''}
            </div>
          </td>
          <td>
            <span style="background:${rColor}22;color:${rColor};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${rLabel}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:8px">${daysStr}</span>
          </td>
        </tr>`;
      });
    }

    // --- Alert banner ---
    let alertBanner = '';
    if (lowList.length > 0) {
      alertBanner = `<div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">🚨</span>
        <div>
          <div style="font-weight:800;color:#dc2626;font-size:14px">Low Readiness Alert</div>
          <div style="font-size:13px;color:#7f1d1d;margin-top:2px">${lowList.join(', ')} — readiness below 5.0. Consider modifying today's session.</div>
        </div>
      </div>`;
    }

    // --- Squad trend chart data (last 14 days) ---
    const trendByDate = {};
    series.forEach(w => {
      if (!trendByDate[w.date]) trendByDate[w.date] = [];
      trendByDate[w.date].push(w.readiness_score);
    });
    const trendDates = Object.keys(trendByDate).sort().slice(-14);
    const trendAvgs = trendDates.map(d => {
      const scores = trendByDate[d].filter(s => s != null);
      return scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : null;
    });

    // --- Athlete filter for trend ---
    const athletes = data.athletes || [];
    const athOptions = athletes.map(a => `<option value="${a}">${a}</option>`).join('');

    el.innerHTML = `
      ${alertBanner}

      <!-- Summary Stats -->
      <div class="section-title">SQUAD WELLNESS OVERVIEW</div>
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card ${avgR >= 7 ? 'green' : avgR >= 5 ? 'warn' : 'red'}">
          <div class="stat-label">Squad Avg Readiness</div>
          <div class="stat-value">${avgR ?? '—'}<span style="font-size:14px;font-weight:500">/10</span></div>
          <div class="stat-sub">Last check-in per athlete</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Checked In Today</div>
          <div class="stat-value">${checkedInToday}<span style="font-size:14px;color:var(--muted);font-weight:500">/${athletes.length||'—'}</span></div>
          <div class="stat-sub">Athletes submitted today</div>
        </div>
        <div class="stat-card ${lowList.length > 0 ? 'red' : 'green'}">
          <div class="stat-label">Low Readiness</div>
          <div class="stat-value">${lowList.length}</div>
          <div class="stat-sub">Athletes below 5.0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Check-ins (28d)</div>
          <div class="stat-value">${totalCheckins}</div>
          <div class="stat-sub">Across all athletes</div>
        </div>
      </div>

      <!-- Squad trend chart -->
      <div class="section-title">SQUAD READINESS TREND (14 DAYS)</div>
      <div class="card" style="margin-bottom:24px;padding:20px">
        <canvas id="wellnessTrendChart" height="80"></canvas>
      </div>

      <!-- Per-athlete breakdown -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="section-title" style="margin:0">ATHLETE BREAKDOWN — LATEST CHECK-IN</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--muted);font-weight:600">FILTER:</span>
          <select id="wellnessAthFilter" onchange="filterWellnessTrend()" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;padding:5px 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;outline:none">
            <option value="">All Athletes</option>
            ${athOptions}
          </select>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
        <table class="data-table">
          <thead><tr>
            <th>Athlete</th>
            <th>Readiness</th>
            <th style="min-width:120px">Sleep</th>
            <th style="min-width:120px">Soreness</th>
            <th style="min-width:120px">Motivation</th>
            <th>Status</th>
          </tr></thead>
          <tbody id="wellnessTableBody">${tableRows}</tbody>
        </table>
      </div>

      <!-- Individual trend chart (shown when athlete filtered) -->
      <div id="wellnessAthChartWrap" style="display:none;margin-bottom:24px">
        <div class="section-title">INDIVIDUAL TREND (28 DAYS)</div>
        <div class="card" style="padding:20px">
          <canvas id="wellnessAthChart" height="100"></canvas>
        </div>
      </div>
    `;

    // Render squad trend chart
    if (trendDates.length > 0) {
      const ctx = document.getElementById('wellnessTrendChart').getContext('2d');
      charts['wellnessTrend'] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trendDates.map(d => d.slice(5)),
          datasets: [{
            label: 'Avg Readiness',
            data: trendAvgs,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,.1)',
            fill: true,
            tension: .35,
            pointRadius: 4,
            pointBackgroundColor: trendAvgs.map(v => v >= 7 ? '#22c55e' : v >= 5 ? '#f59e0b' : '#e63946'),
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 10, ticks: { color:'#8fa0be', stepSize: 2 }, grid: { color:'rgba(255,255,255,.05)' } },
            x: { ticks: { color:'#8fa0be' }, grid: { color:'rgba(255,255,255,.05)' } }
          }
        }
      });
    }

    // Store series for filter
    window._wellnessSeries = series;
    window._wellnessLatest = latest;

  } catch(e) {
    document.getElementById('mainContent').innerHTML = `<div style="text-align:center;padding:60px;color:#e63946">Failed to load wellness data: ${e.message}</div>`;
  }
}

function filterWellnessTrend() {
  const ath = document.getElementById('wellnessAthFilter')?.value;
  const series = window._wellnessSeries || [];
  const latest = window._wellnessLatest || [];

  // Update table
  const readinessColor = (s) => s >= 7 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#e63946';
  const readinessLabel = (s) => s >= 7 ? 'Good' : s >= 5 ? 'Moderate' : 'Low';
  const metricBar = (val, max=10, color='#3b82f6') => {
    const pct = Math.round((val/max)*100);
    return `<div style="background:#e5e7eb;border-radius:4px;height:6px;flex:1"><div style="background:${color};width:${pct}%;height:100%;border-radius:4px"></div></div>`;
  };
  const filtered = ath ? latest.filter(w => w.athlete === ath) : latest;
  const tbody = document.getElementById('wellnessTableBody');
  if (tbody) {
    tbody.innerHTML = filtered.map(w => {
      const rs = w.readiness_score ?? '—';
      const rColor = typeof rs === 'number' ? readinessColor(rs) : '#aaa';
      const rLabel = typeof rs === 'number' ? readinessLabel(rs) : '—';
      const daysAgo = w.date ? Math.round((new Date() - new Date(w.date)) / 86400000) : '?';
      const daysStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
      return `<tr>
        <td class="athlete-name">${w.athlete}</td>
        <td><span style="font-size:18px;font-weight:800;color:${rColor}">${rs}</span><span style="font-size:11px;color:var(--muted)">/10</span></td>
        <td><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;font-weight:600;width:20px">${w.sleep ?? '—'}</span>${typeof w.sleep === 'number' ? metricBar(w.sleep,10,'#3b82f6') : ''}</div></td>
        <td><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;font-weight:600;width:20px">${w.soreness ?? '—'}</span>${typeof w.soreness === 'number' ? metricBar(w.soreness,10,'#e63946') : ''}</div></td>
        <td><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;font-weight:600;width:20px">${w.motivation ?? '—'}</span>${typeof w.motivation === 'number' ? metricBar(w.motivation,10,'#22c55e') : ''}</div></td>
        <td><span style="background:${rColor}22;color:${rColor};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${rLabel}</span><span style="font-size:11px;color:var(--muted);margin-left:8px">${daysStr}</span></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted)">No data for this athlete</td></tr>`;
  }

  // Show/hide individual chart
  const chartWrap = document.getElementById('wellnessAthChartWrap');
  if (ath && chartWrap) {
    chartWrap.style.display = 'block';
    const athSeries = series.filter(w => w.athlete === ath).sort((a,b) => a.date.localeCompare(b.date));
    const dates = athSeries.map(w => w.date.slice(5));
    if (charts['wellnessAth']) { charts['wellnessAth'].destroy(); delete charts['wellnessAth']; }
    const ctx2 = document.getElementById('wellnessAthChart').getContext('2d');
    charts['wellnessAth'] = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label: 'Readiness', data: athSeries.map(w=>w.readiness_score), borderColor:'#22c55e', tension:.35, pointRadius:3 },
          { label: 'Sleep',     data: athSeries.map(w=>w.sleep),           borderColor:'#3b82f6', tension:.35, pointRadius:3, borderDash:[4,2] },
          { label: 'Motivation',data: athSeries.map(w=>w.motivation),      borderColor:'#a855f7', tension:.35, pointRadius:3, borderDash:[4,2] },
          { label: 'Soreness',  data: athSeries.map(w=>w.soreness),        borderColor:'#e63946', tension:.35, pointRadius:3, borderDash:[2,3] },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color:'#8fa0be', boxWidth:12 } } },
        scales: {
          y: { min:0, max:10, ticks:{color:'#8fa0be',stepSize:2}, grid:{color:'rgba(255,255,255,.05)'} },
          x: { ticks:{color:'#8fa0be'}, grid:{color:'rgba(255,255,255,.05)'} }
        }
      }
    });
  } else if (chartWrap) {
    chartWrap.style.display = 'none';
  }
}


