import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadProfile } from './profile.js';

export function extractVipData(content) {
  const match = content.match(/<!--\s*VIP_DATA\s*\n([\s\S]*?)\n-->/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function generateCards(profiles, outputPath) {
  if (!outputPath) {
    outputPath = path.join(os.homedir(), '.vip', 'cards', 'index.html');
  }
  const cards = [];
  const seenSlugs = new Set();

  for (const p of profiles) {
    if (seenSlugs.has(p.slug)) continue; // skip duplicates
    seenSlugs.add(p.slug);
    const content = loadProfile(p.slug);
    if (!content) continue;

    // Extract twitter handle from content
    const twMatch = content.match(/twitter\.com\/(\w+)/i) || content.match(/x\.com\/(\w+)/i);
    const twitterHandle = twMatch ? twMatch[1] : null;

    // Load user annotations
    const annotationFile = path.join(path.dirname(p.path), '.raw', p.slug, 'user_annotations.md');
    let annotations = [];
    if (fs.existsSync(annotationFile)) {
      const annoContent = fs.readFileSync(annotationFile, 'utf-8');
      annotations = annoContent.split('\n')
        .filter(line => line.match(/^- \[/))
        .map(line => line.replace(/^- /, '').trim());
    }

    // Extract last connection from Notes section
    const notesMatch = content.match(/## Notes\n([\s\S]*?)(?=\n##|\n---|$)/);
    let lastConnection = null;
    if (notesMatch) {
      const noteLines = notesMatch[1].split('\n').filter(l => l.startsWith('- ')).map(l => l.replace(/^- /, ''));
      if (noteLines.length) lastConnection = noteLines[noteLines.length - 1];
    }

    const data = extractVipData(content);
    if (!data) {
      const nameMatch = content.match(/^# (.+)$/m);
      const summaryMatch = content.match(/^> (.+)$/m);
      const titleMatch = content.match(/\*\*Title:\*\*\s*(.+)/);
      const companyMatch = content.match(/\*\*Company:\*\*\s*(.+)/);
      const locationMatch = content.match(/\*\*Location:\*\*\s*(.+)/);
      const industryMatch = content.match(/\*\*Industry:\*\*\s*(.+)/);

      cards.push({
        slug: p.slug,
        twitter_handle: twitterHandle,
        name: nameMatch ? nameMatch[1] : p.name,
        title: titleMatch ? titleMatch[1].trim() : '',
        company: companyMatch ? companyMatch[1].trim() : '',
        location: locationMatch ? locationMatch[1].trim() : '',
        mbti: '?',
        scores: {},
        tags: industryMatch ? [industryMatch[1].trim()] : [],
        icebreakers: [],
        dos: [],
        donts: [],
        gifts: [],
        expertise: [],
        superpower: '',
        quote: summaryMatch ? summaryMatch[1] : (p.summary || ''),
        updated: p.updated,
        annotations,
        last_connection: lastConnection,
      });
      continue;
    }

    data.slug = p.slug;
    data.updated = p.updated;
    data.twitter_handle = data.twitter_handle || twitterHandle;
    data.annotations = annotations;
    data.last_connection = lastConnection;
    cards.push(data);
  }

  // Generate individual profile pages
  for (const p of profiles) {
    const content = loadProfile(p.slug);
    if (!content) continue;
    const profileHtml = buildProfilePage(p.name, content);
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${p.slug}.html`), profileHtml, 'utf-8');
  }

  const html = buildHtml(cards);

  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf-8');

  return path.resolve(outputPath);
}

function buildProfilePage(name, markdown) {
  // Convert markdown to simple HTML
  const htmlContent = markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- \*\*(.+?):\*\* (.+)$/gm, '<p><strong>$1:</strong> $2</p>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(name)} - VIPCare</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; max-width: 800px; margin: 0 auto; line-height: 1.7; }
a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }
.back { display: inline-block; margin-bottom: 20px; font-size: 0.9em; }
h1 { color: #2563eb; font-size: 2em; margin: 16px 0 8px; }
h2 { color: #7c3aed; font-size: 1.3em; margin: 24px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
blockquote { color: #d97706; font-style: italic; padding: 8px 16px; border-left: 3px solid #e2e8f0; margin: 8px 0; }
p, li { color: #475569; margin: 4px 0; }
strong { color: #0f172a; }
li { margin-left: 20px; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
.meta { color: #94a3b8; font-size: 0.85em; }
</style>
</head>
<body>
<a href="index.html" class="back">&larr; Back to all cards</a>
${htmlContent}
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(cards) {
  // Escape </script> in JSON to prevent XSS
  const cardsJson = JSON.stringify(cards).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VIPCare</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; }
.layout { display: flex; min-height: 100vh; }
.main { flex: 1; padding: 20px; overflow-y: auto; transition: margin-right 0.3s; }
.main.panel-open { margin-right: 420px; }
header { display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto 24px; }
header h1 { font-size: 1.5em; color: #2563eb; }
header .count { color: #94a3b8; font-size: 0.85em; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; max-width: 1200px; margin: 0 auto; }

.card {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-color: #cbd5e1; }
.card.active { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.2); }
.card-name { font-size: 1.1em; font-weight: 700; color: #0f172a; }
.card-role { font-size: 0.8em; color: #64748b; margin-top: 2px; }
.badge { padding: 3px 8px; border-radius: 4px; font-size: 0.7em; font-weight: 700; display: inline-flex; align-items: center; cursor: help; }
.badge-nt { background: #ede9fe; color: #7c3aed; }
.badge-nf { background: #d1fae5; color: #059669; }
.badge-sj { background: #dbeafe; color: #2563eb; }
.badge-sp { background: #fef3c7; color: #d97706; }
.badge-unknown { background: #f1f5f9; color: #94a3b8; }
.news-chip { background: #f0f9ff; padding: 6px 10px; border-radius: 6px; font-size: 0.75em; color: #1e40af; margin: 8px 0; }
.section-label { font-size: 0.65em; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin: 10px 0 4px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
.tag { background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 4px; font-size: 0.7em; }
.do-dont { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
.do-box, .dont-box { padding: 8px; border-radius: 6px; font-size: 0.75em; }
.do-box { background: #f0fdf4; color: #166534; }
.dont-box { background: #fef2f2; color: #991b1b; }

/* Side Panel */
.panel {
  position: fixed; top: 0; right: -440px; width: 420px; height: 100vh;
  background: #ffffff; border-left: 1px solid #e2e8f0;
  overflow-y: auto; transition: right 0.3s ease;
  box-shadow: -4px 0 20px rgba(0,0,0,0.05);
  z-index: 50; padding: 24px;
  -webkit-overflow-scrolling: touch;
}
.panel.open { right: 0; }
.panel-close { position: absolute; top: 16px; right: 16px; background: none; border: none; color: #94a3b8; font-size: 1.2em; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; }
.panel-close:hover { background: #f1f5f9; color: #475569; }
.panel h2 { color: #2563eb; font-size: 0.9em; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9; }
.panel p, .panel li { color: #475569; font-size: 0.85em; line-height: 1.6; }
.panel ul { padding-left: 16px; }
.panel blockquote { border-left: 3px solid #2563eb; padding: 4px 12px; margin: 6px 0; color: #475569; font-style: italic; font-size: 0.85em; }
.radar { max-width: 100%; }

/* Mobile */
@media (max-width: 768px) {
  .main.panel-open { margin-right: 0; }
  .panel { width: 100%; right: -100%; }
  .grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="layout">
<div class="main" id="main">
  <header>
    <h1>VIPCare</h1>
    <input type="text" id="search" placeholder="Search by name or tag..." style="padding:8px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9em;width:260px;outline:none;color:#1e293b;background:#fff;" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e2e8f0'">
    <span class="count" id="count"></span>
  </header>
  <div class="grid" id="grid"></div>
</div>
<div class="panel" id="panel">
  <button class="panel-close" onclick="closePanel()">&times;</button>
  <div id="panel-content"></div>
</div>
</div>

<script>
const cards = ${cardsJson};

const SCORE_LABELS = {
  openness: 'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion: 'Extraversion',
  agreeableness: 'Agreeableness',
  resilience: 'Resilience',
  decision_style: 'Decision',
  risk_appetite: 'Risk',
  communication: 'Communication',
  influence: 'Influence',
  leadership: 'Leadership'
};

function radarSvg(scores, size = 200) {
  const keys = Object.keys(SCORE_LABELS);
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n = keys.length;

  let gridLines = '';
  for (let level = 1; level <= 5; level++) {
    const lr = r * level / 5;
    let pts = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      pts.push(\`\${cx + lr * Math.cos(angle)},\${cy + lr * Math.sin(angle)}\`);
    }
    gridLines += \`<polygon points="\${pts.join(' ')}" fill="none" stroke="#e2e8f0" stroke-width="0.5"/>\`;
  }

  let axes = '', labels = '', dataPoints = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    axes += \`<line x1="\${cx}" y1="\${cy}" x2="\${x}" y2="\${y}" stroke="#e2e8f0" stroke-width="0.5"/>\`;

    const lx = cx + (r + 22) * Math.cos(angle);
    const ly = cy + (r + 22) * Math.sin(angle);
    const label = SCORE_LABELS[keys[i]] || keys[i];
    labels += \`<text x="\${lx}" y="\${ly}" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-size="9">\${label}</text>\`;

    const val = (scores[keys[i]] || 0) / 5;
    const dx = cx + r * val * Math.cos(angle);
    const dy = cy + r * val * Math.sin(angle);
    dataPoints.push(\`\${dx},\${dy}\`);
  }

  const dataPolygon = \`<polygon points="\${dataPoints.join(' ')}" fill="rgba(37,99,235,0.15)" stroke="#2563eb" stroke-width="1.5"/>\`;

  return \`<svg viewBox="0 0 \${size} \${size}" class="radar">\${gridLines}\${axes}\${dataPolygon}\${labels}</svg>\`;
}

function mbtiClass(mbti) {
  if (!mbti || mbti === '?') return 'badge-unknown';
  const t = mbti.toUpperCase();
  if (t.includes('NT')) return 'badge-nt';
  if (t.includes('NF')) return 'badge-nf';
  if (t[1] === 'S' && t[3] === 'J') return 'badge-sj';
  if (t[1] === 'S' && t[3] === 'P') return 'badge-sp';
  return 'badge-nt';
}

let activeCard = null;

function renderCard(card, index) {
  const avatarUrl = \`https://unavatar.io/twitter/\${card.twitter_handle || card.slug || 'unknown'}\`;
  return \`
    <div class="card" id="card-\${index}" onclick="openPanel(\${index})">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
        <img src="\${avatarUrl}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div class="card-name">\${card.name || 'Unknown'}</div>
          <div class="card-role">\${card.one_liner || card.title || ''}</div>
        </div>
        <span class="badge \${mbtiClass(card.mbti)}" title="\${card.mbti_reason || ''}">\${card.mbti || '?'}</span>
      </div>
      \${card.latest_news ? \`<div class="news-chip">📰 \${card.latest_news.slice(0, 100)}\${card.latest_news.length > 100 ? '...' : ''}</div>\` : ''}
      \${card.current_focus ? \`<div style="font-size:0.8em;color:#475569;margin:4px 0">🎯 \${card.current_focus}</div>\` : ''}
      \${card.last_connection ? \`<div style="font-size:0.75em;color:#2563eb;margin:4px 0">🤝 \${card.last_connection}</div>\` : (card.icebreakers?.[0] ? \`<div style="font-size:0.75em;color:#94a3b8;margin:4px 0">💡 \${card.icebreakers[0]}</div>\` : '')}
      \${card.talking_points?.length ? \`<div class="section-label">Talking Points</div>\${card.talking_points.slice(0,2).map(t => \`<div style="font-size:0.75em;color:#475569">• \${t}</div>\`).join('')}\` : ''}
      \${card.tags?.length ? \`<div class="tags">\${card.tags.slice(0,3).map(t => \`<span class="tag">\${t}</span>\`).join('')}</div>\` : ''}
    </div>\`;
}

function openPanel(index) {
  // Highlight active card
  if (activeCard !== null) document.getElementById('card-' + activeCard)?.classList.remove('active');
  activeCard = index;
  document.getElementById('card-' + index)?.classList.add('active');

  const card = cards[index];
  const s = card.scores || {};
  const panel = document.getElementById('panel-content');
  const avatarUrl = \`https://unavatar.io/twitter/\${card.twitter_handle || card.slug || 'unknown'}\`;

  panel.innerHTML = \`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">
      <img src="\${avatarUrl}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0" onerror="this.style.display='none'">
      <div>
        <div style="font-size:1.3em;font-weight:700;color:#0f172a">\${card.name}</div>
        <div style="font-size:0.85em;color:#64748b">\${card.title || ''}\${card.company ? ' @ ' + card.company : ''}</div>
        \${card.previous_role ? \`<div style="font-size:0.75em;color:#94a3b8">Previously: \${card.previous_role}</div>\` : ''}
        <div style="margin-top:4px">
          \${card.twitter_handle ? \`<a href="https://twitter.com/\${card.twitter_handle}" target="_blank" style="color:#2563eb;font-size:0.8em;text-decoration:none;margin-right:8px">@\${card.twitter_handle}</a>\` : ''}
          <span class="badge \${mbtiClass(card.mbti)}" title="\${card.mbti_reason || ''}">\${card.mbti || '?'}</span>
        </div>
      </div>
    </div>

    \${card.latest_news ? \`<div class="news-chip" style="margin-bottom:12px">📰 \${card.latest_news}</div>\` : ''}

    <h2>Focus & Goals</h2>
    \${card.current_focus ? \`<p>🎯 \${card.current_focus}</p>\` : ''}
    \${card.wants ? \`<p>💎 \${card.wants}</p>\` : ''}

    \${card.philosophy?.length ? \`<h2>Philosophy</h2>\${card.philosophy.map(p => \`<blockquote>"\${p}"</blockquote>\`).join('')}\` : ''}

    \${card.talking_points?.length ? \`<h2>Talking Points</h2><ul>\${card.talking_points.map(t => \`<li>\${t}</li>\`).join('')}</ul>\` : ''}

    <h2>Approach</h2>
    \${card.last_connection ? \`<p>🤝 <strong>Last:</strong> \${card.last_connection}</p>\` : '<p style="color:#94a3b8">No interactions yet</p>'}
    \${card.dos?.length || card.donts?.length ? \`<div class="do-dont">\${card.dos?.length ? \`<div class="do-box"><strong>✅ Do</strong><br>\${card.dos.join('<br>')}</div>\` : ''}\${card.donts?.length ? \`<div class="dont-box"><strong>❌ Don't</strong><br>\${card.donts.join('<br>')}</div>\` : ''}</div>\` : ''}
    \${card.gifts?.length ? \`<p style="font-size:0.85em">🎁 \${card.gifts.join(', ')}</p>\` : ''}

    \${card.competition?.length ? \`<h2>Competition</h2><p style="font-size:0.85em">\${card.competition.join(', ')}</p>\` : ''}

    \${card.key_quotes?.length ? \`<h2>Quotes</h2>\${card.key_quotes.slice(0,4).map(q => \`<p style="font-size:0.8em;color:#475569;margin:3px 0">"\${q}"</p>\`).join('')}\` : ''}

    <h2>Personality</h2>
    <p style="font-size:0.85em"><strong>MBTI:</strong> \${card.mbti || '?'}\${card.mbti_reason ? \` — \${card.mbti_reason}\` : ''}</p>
    \${card.superpower ? \`<p style="font-size:0.85em">⚡ \${card.superpower}</p>\` : ''}
    <div style="display:flex;justify-content:center;margin:12px 0">\${radarSvg(s, 220)}</div>

    \${card.annotations?.length ? \`<h2>Your Notes</h2>\${card.annotations.map(a => \`<p style="font-size:0.8em;color:#64748b">📝 \${a}</p>\`).join('')}\` : ''}

    <div style="display:flex;gap:8px;margin-top:20px">
      \${card.slug ? \`<a href="\${card.slug}.html" style="flex:1;text-align:center;color:#2563eb;text-decoration:none;padding:8px;border:1px solid #2563eb;border-radius:6px;font-size:0.85em">Full Profile</a>\` : ''}
      \${card.slug ? \`<button onclick="regenerateProfile('\${card.slug}',this)" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#64748b;cursor:pointer;font-size:0.85em">🔄 Update</button>\` : ''}
    </div>
  \`;

  document.getElementById('panel').classList.add('open');
  document.getElementById('main').classList.add('panel-open');
}

function closePanel() {
  document.getElementById('panel').classList.remove('open');
  document.getElementById('main').classList.remove('panel-open');
  if (activeCard !== null) document.getElementById('card-' + activeCard)?.classList.remove('active');
  activeCard = null;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

async function regenerateProfile(slug, btn) {
  const orig = btn.textContent;
  btn.textContent = '⏳ Updating...';
  btn.disabled = true;
  try {
    const resp = await fetch(\`/api/regenerate/\${slug}\`);
    if (resp.ok) { btn.textContent = '✅ Done'; setTimeout(() => location.reload(), 1000); }
    else { const d = await resp.json(); btn.textContent = '❌ ' + (d.error||'Failed'); setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000); }
  } catch { btn.textContent = '❌ Error'; setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000); }
}

// Sort by most recently updated
cards.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));

// Render
const grid = document.getElementById('grid');
grid.innerHTML = cards.map((card, i) => renderCard(card, i)).join('');
document.getElementById('count').textContent = cards.length + ' contacts';

document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  cards.forEach((card, i) => {
    const el = document.getElementById('card-' + i);
    const text = [card.name, card.company, card.title, ...(card.tags || [])].join(' ').toLowerCase();
    el.style.display = text.includes(q) ? '' : 'none';
  });
});
</script>
</body>
</html>`;
}
