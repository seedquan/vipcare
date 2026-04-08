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

  for (const p of profiles) {
    const content = loadProfile(p.slug);
    if (!content) continue;

    const data = extractVipData(content);
    if (!data) {
      // Fallback: parse what we can from markdown headers
      const nameMatch = content.match(/^# (.+)$/m);
      const summaryMatch = content.match(/^> (.+)$/m);
      const titleMatch = content.match(/\*\*Title:\*\*\s*(.+)/);
      const companyMatch = content.match(/\*\*Company:\*\*\s*(.+)/);
      const locationMatch = content.match(/\*\*Location:\*\*\s*(.+)/);
      const industryMatch = content.match(/\*\*Industry:\*\*\s*(.+)/);

      cards.push({
        slug: p.slug,
        name: nameMatch ? nameMatch[1] : p.name,
        title: titleMatch ? titleMatch[1].trim() : '',
        company: companyMatch ? companyMatch[1].trim() : '',
        location: locationMatch ? locationMatch[1].trim() : '',
        disc: '?',
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
      });
      continue;
    }

    data.slug = p.slug;
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
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; max-width: 800px; margin: 0 auto; line-height: 1.7; }
a { color: #38bdf8; text-decoration: none; }
a:hover { text-decoration: underline; }
.back { display: inline-block; margin-bottom: 20px; font-size: 0.9em; }
h1 { color: #38bdf8; font-size: 2em; margin: 16px 0 8px; }
h2 { color: #818cf8; font-size: 1.3em; margin: 24px 0 8px; border-bottom: 1px solid #334155; padding-bottom: 6px; }
blockquote { color: #fbbf24; font-style: italic; padding: 8px 16px; border-left: 3px solid #475569; margin: 8px 0; }
p, li { color: #cbd5e1; margin: 4px 0; }
strong { color: #f1f5f9; }
li { margin-left: 20px; }
hr { border: none; border-top: 1px solid #334155; margin: 24px 0; }
.meta { color: #64748b; font-size: 0.85em; }
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
<title>VIPCare - Baseball Cards</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 20px; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); }
h1 { text-align: center; font-size: 1.8em; margin: 20px 0 30px; color: #38bdf8; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; max-width: 1200px; margin: 0 auto; }

.card {
  background: linear-gradient(145deg, #1e293b, #334155);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid #475569;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
  overflow: hidden;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}
.card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(56,189,248,0.15); }
.card:active { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(56,189,248,0.1); }
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4px;
  background: linear-gradient(90deg, #38bdf8, #818cf8, #c084fc);
}

.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.card-name { font-size: 1.4em; font-weight: 700; color: #f1f5f9; }
.card-role { font-size: 0.85em; color: #94a3b8; margin-top: 2px; }
.card-badges { display: flex; gap: 6px; }
.badge { padding: 4px 10px; border-radius: 6px; font-size: 0.75em; font-weight: 700; min-height: 28px; display: inline-flex; align-items: center; }
.badge-disc { background: #38bdf8; color: #0f172a; }
.badge-mbti { background: #818cf8; color: #0f172a; }

.card-quote { font-style: italic; color: #94a3b8; font-size: 0.8em; margin: 10px 0; padding: 8px 12px; border-left: 3px solid #475569; }

.radar-container { display: flex; justify-content: center; margin: 16px 0; }
.radar { width: 200px; height: 200px; max-width: 100%; }

.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.tag { background: #1e3a5f; color: #38bdf8; padding: 4px 12px; border-radius: 12px; font-size: 0.75em; min-height: 28px; display: inline-flex; align-items: center; }

.expertise { margin: 10px 0; }
.expertise-title { font-size: 0.75em; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.expertise-item { font-size: 0.8em; color: #cbd5e1; padding: 2px 0; }
.superpower { color: #fbbf24; font-weight: 600; font-size: 0.85em; margin: 6px 0; }

.tips { margin-top: 12px; border-top: 1px solid #475569; padding-top: 12px; }
.tip-row { display: flex; gap: 4px; font-size: 0.8em; margin: 4px 0; color: #cbd5e1; min-height: 44px; align-items: center; }
.tip-icon { width: 20px; text-align: center; }
.tip-label { color: #64748b; min-width: 55px; }

/* Modal */
.modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 100; justify-content: center; align-items: center; padding: 20px; }
.modal-overlay.active { display: flex; }
.modal {
  background: #1e293b; border-radius: 16px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;
  border: 1px solid #475569;
  -webkit-overflow-scrolling: touch;
}
.modal-close { float: right; background: none; border: none; color: #94a3b8; font-size: 1.5em; cursor: pointer; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
.modal h2 { color: #38bdf8; margin: 16px 0 8px; font-size: 1.1em; }
.modal p, .modal li { color: #cbd5e1; font-size: 0.9em; line-height: 1.6; }
.modal ul { padding-left: 20px; }

/* Mobile: screens < 480px */
@media (max-width: 480px) {
  body { padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); }
  h1 { font-size: 1.5em; margin: 12px 0 20px; }
  .grid { grid-template-columns: 1fr; gap: 16px; }
  .card { padding: 18px; }
  .card-name { font-size: 1.25em; }
  .card-role { font-size: 0.9em; }
  .card-quote { font-size: 0.85em; }
  .tip-row { font-size: 0.85em; }
  .radar { width: 180px; height: 180px; }
  .badge { font-size: 0.8em; padding: 5px 12px; }
  .tag { font-size: 0.8em; padding: 5px 14px; }

  .modal-overlay { padding: 0; align-items: stretch; }
  .modal { max-width: 100%; max-height: 100vh; height: 100%; border-radius: 0; padding: 20px; padding-top: max(20px, env(safe-area-inset-top)); padding-bottom: max(20px, env(safe-area-inset-bottom)); }
  .modal h2 { font-size: 1.15em; }
  .modal p, .modal li { font-size: 0.95em; line-height: 1.7; }
}
</style>
</head>
<body>

<h1>VIPCare</h1>
<div class="grid" id="grid"></div>

<div class="modal-overlay" id="modal" onclick="if(event.target===this)closeModal()">
  <div class="modal" id="modal-content"></div>
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
    gridLines += \`<polygon points="\${pts.join(' ')}" fill="none" stroke="#334155" stroke-width="0.5"/>\`;
  }

  let axes = '', labels = '', dataPoints = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    axes += \`<line x1="\${cx}" y1="\${cy}" x2="\${x}" y2="\${y}" stroke="#334155" stroke-width="0.5"/>\`;

    const lx = cx + (r + 22) * Math.cos(angle);
    const ly = cy + (r + 22) * Math.sin(angle);
    const label = SCORE_LABELS[keys[i]] || keys[i];
    labels += \`<text x="\${lx}" y="\${ly}" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-size="9">\${label}</text>\`;

    const val = (scores[keys[i]] || 0) / 5;
    const dx = cx + r * val * Math.cos(angle);
    const dy = cy + r * val * Math.sin(angle);
    dataPoints.push(\`\${dx},\${dy}\`);
  }

  const dataPolygon = \`<polygon points="\${dataPoints.join(' ')}" fill="rgba(56,189,248,0.2)" stroke="#38bdf8" stroke-width="1.5"/>\`;

  return \`<svg viewBox="0 0 \${size} \${size}" class="radar">\${gridLines}\${axes}\${dataPolygon}\${labels}</svg>\`;
}

function renderCard(card, index) {
  const scores = card.scores || {};
  const radar = radarSvg(scores);

  return \`
    <div class="card" onclick="openModal(\${index})">
      <div class="card-header">
        <div>
          <div class="card-name">\${card.name || 'Unknown'}</div>
          <div class="card-role">\${card.title || ''}\${card.company ? ' @ ' + card.company : ''}</div>
        </div>
        <div class="card-badges">
          <span class="badge badge-disc">\${card.disc || '?'}</span>
          <span class="badge badge-mbti">\${card.mbti || '?'}</span>
        </div>
      </div>
      \${card.quote ? \`<div class="card-quote">"\${card.quote.slice(0, 120)}\${card.quote.length > 120 ? '...' : ''}"</div>\` : ''}
      <div class="radar-container">\${radar}</div>
      \${card.superpower ? \`<div class="superpower">⚡ \${card.superpower}</div>\` : ''}
      \${card.tags?.length ? \`<div class="tags">\${card.tags.map(t => \`<span class="tag">\${t}</span>\`).join('')}</div>\` : ''}
      <div class="tips">
        \${card.icebreakers?.length ? \`<div class="tip-row"><span class="tip-icon">💡</span><span class="tip-label">Icebreaker</span>\${card.icebreakers[0]}</div>\` : ''}
        \${card.dos?.length ? \`<div class="tip-row"><span class="tip-icon">✅</span><span class="tip-label">Do</span>\${card.dos[0]}</div>\` : ''}
        \${card.donts?.length ? \`<div class="tip-row"><span class="tip-icon">❌</span><span class="tip-label">Don't</span>\${card.donts[0]}</div>\` : ''}
      </div>
    </div>\`;
}

function openModal(index) {
  const card = cards[index];
  const s = card.scores || {};
  const modal = document.getElementById('modal-content');

  modal.innerHTML = \`
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h1 style="color:#38bdf8;margin-bottom:4px">\${card.name}</h1>
    <p style="color:#94a3b8">\${card.title || ''}\${card.company ? ' @ ' + card.company : ''}\${card.location ? ' · ' + card.location : ''}</p>
    \${card.quote ? \`<div class="card-quote" style="margin:16px 0">"\${card.quote}"</div>\` : ''}

    <h2>Personality</h2>
    <p><strong>DISC:</strong> \${card.disc || '?'} &nbsp; <strong>MBTI:</strong> \${card.mbti || '?'}</p>
    <div style="display:flex;justify-content:center;margin:16px 0">\${radarSvg(s, 260)}</div>

    \${card.expertise?.length ? \`<h2>Expertise</h2><ul>\${card.expertise.map(e => \`<li>\${e}</li>\`).join('')}</ul>\` : ''}
    \${card.superpower ? \`<p><strong>⚡ Superpower:</strong> \${card.superpower}</p>\` : ''}

    <h2>How to Work With Them</h2>
    \${card.icebreakers?.length ? \`<p><strong>💡 Icebreakers:</strong> \${card.icebreakers.join(', ')}</p>\` : ''}
    \${card.dos?.length ? \`<p><strong>✅ Do:</strong> \${card.dos.join(' · ')}</p>\` : ''}
    \${card.donts?.length ? \`<p><strong>❌ Don't:</strong> \${card.donts.join(' · ')}</p>\` : ''}
    \${card.gifts?.length ? \`<p><strong>🎁 Gifts:</strong> \${card.gifts.join(', ')}</p>\` : ''}

    \${card.tags?.length ? \`<h2>Tags</h2><div class="tags">\${card.tags.map(t => \`<span class="tag">\${t}</span>\`).join('')}</div>\` : ''}

    \${card.slug ? \`<p style="margin-top:20px;text-align:center"><a href="\${card.slug}.html" style="color:#38bdf8;text-decoration:none;padding:8px 20px;border:1px solid #38bdf8;border-radius:8px;display:inline-block">View Full Profile →</a></p>\` : ''}
  \`;

  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Render
const grid = document.getElementById('grid');
grid.innerHTML = cards.map((card, i) => renderCard(card, i)).join('');
</script>
</body>
</html>`;
}
