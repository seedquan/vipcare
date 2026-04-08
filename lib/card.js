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
        annotations,
        last_connection: lastConnection,
      });
      continue;
    }

    data.slug = p.slug;
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
<title>VIPCare - Baseball Cards</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; padding: 20px; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); }
h1 { text-align: center; font-size: 1.8em; margin: 20px 0 30px; color: #2563eb; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; max-width: 1200px; margin: 0 auto; }

.card {
  background: #ffffff;
  border-radius: 16px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
  overflow: hidden;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}
.card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(37,99,235,0.12); }
.card:active { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37,99,235,0.08); }
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4px;
  background: linear-gradient(90deg, #2563eb, #7c3aed, #db2777);
}

.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.card-name { font-size: 1.4em; font-weight: 700; color: #0f172a; }
.card-role { font-size: 0.85em; color: #64748b; margin-top: 2px; }
.card-badges { display: flex; gap: 6px; }
.badge { padding: 4px 10px; border-radius: 6px; font-size: 0.75em; font-weight: 700; min-height: 28px; display: inline-flex; align-items: center; }
.badge-disc { background: #2563eb; color: #ffffff; }
.badge-mbti { background: #7c3aed; color: #ffffff; }

.card-quote { font-style: italic; color: #64748b; font-size: 0.8em; margin: 10px 0; padding: 8px 12px; border-left: 3px solid #e2e8f0; }

.radar-container { display: flex; justify-content: center; margin: 16px 0; }
.radar { width: 200px; height: 200px; max-width: 100%; }

.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.tag { background: #eff6ff; color: #2563eb; padding: 4px 12px; border-radius: 12px; font-size: 0.75em; min-height: 28px; display: inline-flex; align-items: center; }

.expertise { margin: 10px 0; }
.expertise-title { font-size: 0.75em; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.expertise-item { font-size: 0.8em; color: #475569; padding: 2px 0; }
.superpower { color: #d97706; font-weight: 600; font-size: 0.85em; margin: 6px 0; }

.tips { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
.tip-row { display: flex; gap: 4px; font-size: 0.8em; margin: 4px 0; color: #475569; min-height: 44px; align-items: center; }
.tip-icon { width: 20px; text-align: center; }
.tip-label { color: #94a3b8; min-width: 55px; }

/* Modal */
.modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 100; justify-content: center; align-items: center; padding: 20px; }
.modal-overlay.active { display: flex; }
.modal {
  background: #ffffff; border-radius: 16px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 32px;
  border: 1px solid #e2e8f0; box-shadow: 0 25px 50px rgba(0,0,0,0.15);
  -webkit-overflow-scrolling: touch;
}
.modal-close { float: right; background: none; border: none; color: #94a3b8; font-size: 1.5em; cursor: pointer; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
.modal h2 { color: #2563eb; margin: 16px 0 8px; font-size: 1.1em; }
.modal p, .modal li { color: #475569; font-size: 0.9em; line-height: 1.6; }
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

function renderCard(card, index) {
  const avatarUrl = \`https://unavatar.io/twitter/\${card.twitter_handle || card.slug || 'unknown'}\`;

  return \`
    <div class="card" onclick="openModal(\${index})">
      <div class="card-header">
        <div style="display:flex;gap:12px;align-items:center">
          <img src="\${avatarUrl}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0" onerror="this.style.display='none'">
          <div>
            <div class="card-name">\${card.name || 'Unknown'}</div>
            <div class="card-role">\${card.one_liner || card.title || ''}</div>
          </div>
        </div>
        <span class="badge badge-mbti" title="\${card.mbti_reason || ''}">\${card.mbti || '?'}</span>
      </div>
      \${card.latest_news ? \`<div style="background:#f0f9ff;padding:8px 12px;border-radius:8px;font-size:0.8em;color:#1e40af;margin:8px 0">📰 \${card.latest_news.slice(0, 120)}\${card.latest_news.length > 120 ? '...' : ''}</div>\` : ''}
      \${card.current_focus ? \`<div style="font-size:0.85em;color:#475569;margin:6px 0"><strong>Focus:</strong> \${card.current_focus}</div>\` : ''}
      \${card.wants ? \`<div style="font-size:0.85em;color:#475569;margin:6px 0"><strong>Wants:</strong> \${card.wants}</div>\` : ''}
      \${card.last_connection ? \`<div style="font-size:0.8em;color:#2563eb;margin:6px 0">🤝 \${card.last_connection}</div>\` : \`<div style="font-size:0.8em;color:#94a3b8;margin:6px 0">💡 \${card.icebreakers?.[0] || 'No connection yet'}</div>\`}
      \${card.talking_points?.length ? \`<div style="margin:8px 0"><div style="font-size:0.75em;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Talking Points</div>\${card.talking_points.slice(0,2).map(t => \`<div style="font-size:0.8em;color:#475569;padding:2px 0">• \${t}</div>\`).join('')}</div>\` : ''}
      \${card.annotations?.length ? \`<div style="border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px;font-size:0.75em;color:#64748b">📝 \${card.annotations[card.annotations.length-1]}</div>\` : ''}
      <button onclick="event.stopPropagation();regenerateProfile('\${card.slug}',this)" style="margin-top:10px;width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#64748b;font-size:0.75em;cursor:pointer;transition:all 0.2s" onmouseover="this.style.borderColor='#2563eb';this.style.color='#2563eb'" onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#64748b'">🔄 Update Profile</button>
    </div>\`;
}

function openModal(index) {
  const card = cards[index];
  const s = card.scores || {};
  const modal = document.getElementById('modal-content');

  const avatarUrl = \`https://unavatar.io/twitter/\${card.twitter_handle || card.slug || 'unknown'}\`;

  modal.innerHTML = \`
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px">
      <img src="\${avatarUrl}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0" onerror="this.style.display='none'">
      <div>
        <h1 style="color:#2563eb;margin-bottom:4px;font-size:1.5em">\${card.name}</h1>
        <p style="color:#64748b">\${card.title || ''}\${card.company ? ' @ ' + card.company : ''}</p>
        \${card.previous_role ? \`<p style="color:#94a3b8;font-size:0.8em">Previously: \${card.previous_role}</p>\` : ''}
        \${card.twitter_handle ? \`<a href="https://twitter.com/\${card.twitter_handle}" target="_blank" style="color:#2563eb;font-size:0.85em;text-decoration:none">@\${card.twitter_handle}</a>\` : ''}
      </div>
    </div>

    \${card.latest_news ? \`<div style="background:#f0f9ff;padding:10px 14px;border-radius:8px;font-size:0.85em;color:#1e40af;margin:12px 0">📰 \${card.latest_news}</div>\` : ''}

    <h2>Current Focus</h2>
    \${card.current_focus ? \`<p>\${card.current_focus}</p>\` : '<p style="color:#94a3b8">No data available.</p>'}
    \${card.wants ? \`<p><strong>Wants:</strong> \${card.wants}</p>\` : ''}

    \${card.philosophy?.length ? \`<h2>Core Philosophy</h2>\${card.philosophy.map(p => \`<blockquote style="border-left:3px solid #2563eb;padding:4px 12px;margin:8px 0;color:#475569;font-style:italic">"\${p}"</blockquote>\`).join('')}\` : ''}

    \${card.competition?.length ? \`<h2>Competition</h2><p>\${card.competition.join(', ')}</p>\` : ''}

    \${card.talking_points?.length ? \`<h2>Talking Points</h2><ul>\${card.talking_points.map(t => \`<li>\${t}</li>\`).join('')}</ul>\` : ''}

    <h2>How to Work With Them</h2>
    \${card.last_connection ? \`<p><strong>🤝 Last:</strong> \${card.last_connection}</p>\` : ''}
    \${card.dos?.length ? \`<p><strong>✅ Do:</strong> \${card.dos.join(' · ')}</p>\` : ''}
    \${card.donts?.length ? \`<p><strong>❌ Don't:</strong> \${card.donts.join(' · ')}</p>\` : ''}
    \${card.gifts?.length ? \`<p><strong>🎁 Gifts:</strong> \${card.gifts.join(', ')}</p>\` : ''}

    \${card.key_quotes?.length ? \`<h2>Key Quotes</h2>\${card.key_quotes.slice(0,5).map(q => \`<p style="font-size:0.85em;color:#475569;padding:2px 0">• "\${q}"</p>\`).join('')}\` : ''}

    <h2>Personality</h2>
    <p><strong>MBTI:</strong> <span style="cursor:help;border-bottom:1px dashed #94a3b8" title="\${card.mbti_reason || ''}">\${card.mbti || '?'}</span>\${card.mbti_reason ? \` — \${card.mbti_reason}\` : ''}</p>
    \${card.superpower ? \`<p><strong>⚡ Superpower:</strong> \${card.superpower}</p>\` : ''}
    <div style="display:flex;justify-content:center;margin:16px 0">\${radarSvg(s, 240)}</div>

    \${card.annotations?.length ? \`<h2>Your Notes</h2>\${card.annotations.map(a => \`<p style="font-size:0.85em;color:#64748b">📝 \${a}</p>\`).join('')}\` : ''}

    \${card.tags?.length ? \`<div class="tags" style="margin-top:12px">\${card.tags.map(t => \`<span class="tag">\${t}</span>\`).join('')}</div>\` : ''}

    <div style="display:flex;gap:10px;justify-content:center;margin-top:20px">
      \${card.slug ? \`<a href="\${card.slug}.html" style="color:#2563eb;text-decoration:none;padding:8px 20px;border:1px solid #2563eb;border-radius:8px;display:inline-block">View Full Profile →</a>\` : ''}
      \${card.slug ? \`<button onclick="regenerateProfile('\${card.slug}',this)" style="padding:8px 20px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#64748b;cursor:pointer;font-size:0.9em">🔄 Update</button>\` : ''}
    </div>
  \`;

  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

async function regenerateProfile(slug, btn) {
  const originalText = btn.textContent;
  btn.textContent = '⏳ Updating...';
  btn.disabled = true;
  btn.style.opacity = '0.6';

  try {
    const resp = await fetch(\`/api/regenerate/\${slug}\`);
    const data = await resp.json();

    if (resp.ok) {
      btn.textContent = '✅ Updated!';
      btn.style.color = '#16a34a';
      // Reload page after a short delay to show new data
      setTimeout(() => location.reload(), 1500);
    } else {
      btn.textContent = '❌ ' + (data.error || 'Failed');
      btn.style.color = '#dc2626';
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = '1'; btn.style.color = ''; }, 3000);
    }
  } catch (e) {
    btn.textContent = '❌ Error';
    btn.style.color = '#dc2626';
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = '1'; btn.style.color = ''; }, 3000);
  }
}

// Render
const grid = document.getElementById('grid');
grid.innerHTML = cards.map((card, i) => renderCard(card, i)).join('');
</script>
</body>
</html>`;
}
