/** The live dashboard — a self-contained page (no external deps) that polls
 * /api/state, draws the task DAG in columns by phase, animates nodes as they
 * change phase, and highlights in-flight + "what's next". Served at `/`. */
export const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Norma — live</title>
<style>
  :root {
    /* shadcn "stone" (neutral) dark tokens */
    --bg: oklch(0.145 0 0); --panel: oklch(0.205 0 0); --line: oklch(1 0 0 / 10%);
    --text: oklch(0.985 0 0); --muted: oklch(0.708 0 0);
    --primary: oklch(0.922 0 0); --primary-fg: oklch(0.205 0 0);
    --backlog:#78716c; --ready:#3b82f6; --in_progress:#f59e0b; --needs_rework:#ef4444;
    --needs_review:#a855f7; --needs_qa:#14b8a6; --released:#22c55e; --done:#15803d; --canceled:#57534e;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.4 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { display:flex; align-items:center; gap:16px; padding:12px 18px; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0; z-index:5; }
  header h1 { font-size:15px; margin:0; letter-spacing:.3px; }
  header h1 b { color:var(--released); }
  .spacer { flex:1; }
  button { background:#1c2333; color:var(--text); border:1px solid var(--line); border-radius:8px; padding:7px 12px; cursor:pointer; font-size:13px; }
  button:hover { border-color:#39415a; }
  button.primary { background:var(--primary); border-color:var(--primary); color:var(--primary-fg); font-weight:600; }
  #status { color:var(--muted); font-size:13px; }
  #status b { color:var(--text); }
  .cols { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(150px,1fr); gap:0; padding:0 8px; }
  .col-h { position:sticky; top:49px; background:var(--bg); padding:10px 8px 6px; font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); border-bottom:1px solid var(--line); text-align:center; z-index:4; }
  .col-h .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; }
  #graph { position:relative; }
  #edges { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:1; }
  .node { position:absolute; z-index:2; width:132px; padding:8px 10px; border-radius:10px; background:var(--panel);
          border:1px solid var(--line); border-left:4px solid var(--muted);
          transition: transform .6s cubic-bezier(.4,0,.2,1), border-color .3s, box-shadow .3s; will-change:transform; }
  .node .ref { font-weight:700; font-size:12px; }
  .node .title { color:var(--muted); font-size:11px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .node .owner { display:inline-block; margin-top:6px; font-size:10px; color:var(--muted); border:1px solid var(--line); border-radius:6px; padding:1px 6px; }
  .node.inflight { box-shadow:0 0 0 2px rgba(245,158,11,.5); animation:pulse 1.4s ease-in-out infinite; }
  .node.next { box-shadow:0 0 0 2px rgba(59,130,246,.7), 0 0 18px rgba(59,130,246,.35); }
  .node .tag { position:absolute; top:-9px; right:-6px; font-size:9px; background:var(--ready); color:#04122b; border-radius:6px; padding:1px 6px; font-weight:700; text-transform:uppercase; }
  @keyframes pulse { 0%,100%{ box-shadow:0 0 0 2px rgba(245,158,11,.5);} 50%{ box-shadow:0 0 0 4px rgba(245,158,11,.15);} }
  .banner { margin:10px 18px; padding:10px 14px; border-radius:10px; background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.4); color:var(--released); display:none; }
  .banner.show { display:block; }
</style>
</head>
<body>
<header>
  <h1><b>norma</b> · live</h1>
  <button id="play" class="primary">▶ auto</button>
  <button id="step">step</button>
  <div id="status">connecting…</div>
  <div class="spacer"></div>
  <div id="proj" style="color:var(--muted)"></div>
</header>
<div id="done" class="banner">🏁 epic complete — every task released.</div>
<div class="col-h cols" id="heads"></div>
<div id="graph"><svg id="edges"><defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#39415a"/></marker>
</defs></svg></div>

<script>
const PHASES = ["backlog","ready","in_progress","needs_rework","needs_review","needs_qa","released","done"];
const LABEL = { backlog:"Backlog", ready:"Ready", in_progress:"In progress", needs_rework:"Rework", needs_review:"Review", needs_qa:"QA", released:"Released", done:"Done" };
const COLW = 150, NODE_H = 70, TOP = 8, GAP = 12;
const colIndex = (p) => { const i = PHASES.indexOf(p); return i < 0 ? PHASES.indexOf("done") : i; };
const nodes = new Map();
let playing = false, timer = null;

const heads = document.getElementById("heads");
PHASES.forEach((p) => {
  const d = document.createElement("div"); d.className = "col-h";
  d.innerHTML = '<span class="dot" style="background:var(--'+p+')"></span>' + LABEL[p];
  heads.appendChild(d);
});

const graph = document.getElementById("graph");
const svg = document.getElementById("edges");

function render(state) {
  document.getElementById("proj").textContent = state.project || "";
  const seen = new Set();
  const rows = {}; // phase -> next row
  const nextSet = new Set(state.next || []);
  const inflightSet = new Set(Object.values(state.inFlight || {}).flat());
  const actionByRef = {};
  for (const a of state.actions || []) for (const r of a.refs) actionByRef[r] = a.kind;

  // stable order: by ref number
  const sorted = [...state.tasks].sort((a,b)=> (parseInt((a.ref.match(/\\d+/)||[0])[0]) - parseInt((b.ref.match(/\\d+/)||[0])[0])));
  for (const t of sorted) {
    seen.add(t.ref);
    let n = nodes.get(t.ref);
    if (!n) {
      n = document.createElement("div"); n.className = "node"; n.dataset.ref = t.ref;
      n.innerHTML = '<div class="ref"></div><div class="title"></div><span class="owner"></span><span class="tag"></span>';
      graph.appendChild(n); nodes.set(t.ref, n);
    }
    n.querySelector(".ref").textContent = t.ref;
    n.querySelector(".title").textContent = t.title;
    n.title = t.title;
    const owner = n.querySelector(".owner"); owner.textContent = t.owner || "—";
    n.style.borderLeftColor = "var(--"+t.phase+")";
    const ci = colIndex(t.phase);
    const row = rows[ci] = (rows[ci] ?? 0);
    rows[ci] = row + 1;
    const x = ci * COLW + 12, y = TOP + row * (NODE_H + GAP) + 34;
    n.style.transform = "translate("+x+"px,"+y+"px)";
    n.classList.toggle("inflight", inflightSet.has(t.ref));
    n.classList.toggle("next", nextSet.has(t.ref));
    const tag = n.querySelector(".tag");
    if (nextSet.has(t.ref)) { tag.style.display="block"; tag.textContent = actionByRef[t.ref] || "next"; }
    else tag.style.display = "none";
  }
  for (const [ref, n] of nodes) if (!seen.has(ref)) { n.remove(); nodes.delete(ref); }

  const maxRows = Math.max(1, ...Object.values(rows));
  graph.style.height = (TOP + 34 + maxRows * (NODE_H + GAP) + 20) + "px";
  window._edges = state.edges || [];

  const c = state.counts || {};
  document.getElementById("status").innerHTML =
    "<b>" + state.tasks.length + "</b> tasks · " +
    PHASES.filter(p=>c[p]).map(p=> LABEL[p]+": "+c[p]).join(" · ");
  document.getElementById("done").classList.toggle("show", !!state.complete);
  if (state.complete) stop();
}

function drawEdges() {
  const edges = window._edges || [];
  const box = graph.getBoundingClientRect();
  const lines = edges.map((e) => {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (!a || !b) return "";
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.right - box.left, y1 = ra.top - box.top + ra.height/2;
    const x2 = rb.left - box.left, y2 = rb.top - box.top + rb.height/2;
    const mx = (x1+x2)/2;
    return '<path d="M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2+'" fill="none" stroke="#39415a" stroke-width="1.5" marker-end="url(#arrow)"/>';
  });
  svg.innerHTML = svg.querySelector("defs").outerHTML + lines.join("");
  requestAnimationFrame(drawEdges);
}

async function refresh() {
  try { const r = await fetch("/api/state"); render(await r.json()); }
  catch (e) { document.getElementById("status").textContent = "disconnected"; }
}
async function stepOnce() {
  try { const r = await fetch("/api/step", { method:"POST" }); render(await r.json()); }
  catch (e) {}
}
function play() { playing = true; document.getElementById("play").textContent = "⏸ pause"; timer = setInterval(stepOnce, 1300); }
function stop() { playing = false; document.getElementById("play").textContent = "▶ auto"; if (timer) clearInterval(timer); timer = null; }
document.getElementById("play").onclick = () => playing ? stop() : play();
document.getElementById("step").onclick = stepOnce;

refresh();
setInterval(() => { if (!playing) refresh(); }, 2500);
requestAnimationFrame(drawEdges);
</script>
</body>
</html>`;
