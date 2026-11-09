import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.1/+esm";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LABELS = ["Front", "Left side", "Back", "Right side"];
const STYLES = ["Galaxy", "Pastel", "Rainbow", "Spooky", "Anime", "Fairy", "Candy", "Ocean", "Steampunk", "Floral"];

const state = { photos: [null, null, null, null], mode: "lps", sculpt: "small", styles: new Set(), current: null };

/* ---------- storage ---------- */
const store = {
  get: k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
let dbP;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open("minimuse", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("designs", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
async function dbAll() {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction("designs").objectStore("designs").getAll(); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
}
async function dbPut(v) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction("designs", "readwrite"); t.objectStore("designs").put(v); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function dbDel(id) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction("designs", "readwrite"); t.objectStore("designs").delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); });
}

/* ---------- tabs ---------- */
function showTab(name) {
  $$("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  ["create", "gallery", "settings"].forEach(t => $("#tab-" + t).classList.toggle("hide", t !== name));
  if (name === "gallery") renderGallery();
  window.scrollTo(0, 0);
}
$$("nav.tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

/* ---------- step 1: photos ---------- */
const camIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';
let pickIndex = 0;
function renderSlots() {
  $("#slots").innerHTML = state.photos.map((p, i) => p
    ? `<div class="slot filled" data-i="${i}"><img src="${p.url}" alt="${LABELS[i]} photo"><span class="tag">${LABELS[i]}</span><button class="x" data-x="${i}" aria-label="Remove ${LABELS[i]} photo">×</button></div>`
    : `<div class="slot" data-i="${i}" role="button" tabindex="0">${camIcon}<span>${LABELS[i]}</span><span class="small" style="font-weight:400">Tap to add</span></div>`).join("");
}
$("#slots").addEventListener("click", e => {
  const x = e.target.closest("[data-x]");
  if (x) { e.stopPropagation(); const i = +x.dataset.x; URL.revokeObjectURL(state.photos[i].url); state.photos[i] = null; renderSlots(); return; }
  const s = e.target.closest(".slot"); if (!s) return;
  pickIndex = +s.dataset.i;
  $("#sheetTitle").textContent = `Add ${LABELS[pickIndex].toLowerCase()} photo`;
  $("#sheet").classList.remove("hide");
});
const closeSheet = () => $("#sheet").classList.add("hide");
const openPicker = id => { closeSheet(); $(id).value = ""; $(id).click(); };
$("#pickCam").onclick = () => openPicker("#camIn");
$("#pickGal").onclick = () => openPicker("#fileIn");
$("#pickCancel").onclick = closeSheet;
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
["#fileIn", "#camIn"].forEach(id => $(id).addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  if (state.photos[pickIndex]) URL.revokeObjectURL(state.photos[pickIndex].url);
  state.photos[pickIndex] = { file: f, url: URL.createObjectURL(f) };
  renderSlots(); $("#photoErr").classList.add("hide");
}));
$("#toIdea").addEventListener("click", () => {
  if (state.photos.some(p => !p)) { $("#photoErr").classList.remove("hide"); return; }
  goStep(2);
});

function goStep(n) {
  $("#step-photos").classList.toggle("hide", n !== 1);
  $("#step-idea").classList.toggle("hide", n !== 2);
  $("#step-result").classList.toggle("hide", n !== 3);
  [1, 2, 3].forEach(i => $("#st" + i).classList.toggle("on", i <= n));
  window.scrollTo(0, 0);
}

/* ---------- step 2: idea ---------- */
$$(".mode").forEach(b => b.addEventListener("click", () => {
  state.mode = b.dataset.mode;
  $$(".mode").forEach(m => m.classList.toggle("on", m === b));
  $("#sculptBox").classList.toggle("hide", state.mode !== "lps");
}));
$$("#sculpt .chip").forEach(b => b.addEventListener("click", () => {
  state.sculpt = b.dataset.v; $$("#sculpt .chip").forEach(c => c.classList.toggle("on", c === b));
}));
$("#styles").innerHTML = STYLES.map(s => `<button class="chip" data-s="${s}">${s}</button>`).join("");
$("#styles").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  const s = b.dataset.s; state.styles.has(s) ? state.styles.delete(s) : state.styles.add(s);
  b.classList.toggle("on"); $("#ideaErr").classList.add("hide");
});
$("#idea").addEventListener("input", () => $("#ideaErr").classList.add("hide"));
$("#backPhotos").addEventListener("click", () => goStep(1));
const ideaOK = () => { if (!$("#idea").value.trim() && !state.styles.size) { $("#ideaErr").classList.remove("hide"); return false; } return true; };
$("#makeGem").addEventListener("click", () => { if (ideaOK()) startGemini(); });
$("#makeIt").addEventListener("click", () => {
  if (!ideaOK()) return;
  if (!store.get("hfToken")) { alert("Add your free Hugging Face token in Settings first."); showTab("settings"); return; }
  generate();
});
$("#failBack").addEventListener("click", () => goStep(2));
$("#failRetry").addEventListener("click", () => generate());

/* ---------- image helpers ---------- */
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { return await createImageBitmap(file); }
}
// 2x2 grid, each panel 512x640, center-crop on the middle of the photo
async function buildGrid() {
  const W = 512, H = 640, c = document.createElement("canvas");
  c.width = W * 2; c.height = H * 2;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 4; i++) {
    const bm = await loadBitmap(state.photos[i].file);
    let cw = bm.width * 0.7, ch = cw * H / W;
    if (ch > bm.height * 0.85) { ch = bm.height * 0.85; cw = ch * W / H; }
    const cx = bm.width / 2, cy = bm.height * 0.52;
    const sx = Math.max(0, Math.min(bm.width - cw, cx - cw / 2)), sy = Math.max(0, Math.min(bm.height - ch, cy - ch / 2));
    ctx.drawImage(bm, sx, sy, cw, ch, (i % 2) * W, Math.floor(i / 2) * H, W, H);
  }
  return new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
}
async function splitViews(blob) {
  const bm = await createImageBitmap(blob), w = bm.width / 2, h = bm.height / 2, out = [];
  for (let i = 0; i < 4; i++) {
    const c = document.createElement("canvas"); c.width = Math.round(w); c.height = Math.round(h);
    c.getContext("2d").drawImage(bm, (i % 2) * w, Math.floor(i / 2) * h, w, h, 0, 0, c.width, c.height);
    out.push(c.toDataURL("image/jpeg", 0.9));
  }
  return out;
}
const blobToDataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

/* ---------- prompt ---------- */
function ideaText() {
  const idea = $("#idea").value.trim();
  const styles = [...state.styles].join(", ");
  return [idea, styles && `style: ${styles}`].filter(Boolean).join(". ");
}
function sculptRule() {
  if (state.mode === "mini" || state.sculpt === "none") return "Only change the paint. Do not add or change any shapes.";
  if (state.sculpt === "small") return "Keep the toy's shape, but you may add a few small sculpted polymer clay add-ons that fit the idea (such as hair, horns, wings, bows, or accessories).";
  return "Give it a full custom makeover with sculpted polymer clay add-ons (such as hair, mane, tail, wings, accessories) that fit the idea, while keeping the same base pose.";
}
function buildPrompt(recipe) {
  const want = recipe ? `follow this exact design recipe for every panel:
${recipe}
` : ideaText() + ".";
  const kind = state.mode === "lps" ? "Littlest Pet Shop toy" : "tabletop miniature figure";
  const sculpt = sculptRule();
  return `This is a 2x2 grid of the same ${kind} photographed from four sides: top-left is the front, top-right is one side, bottom-left is the BACK (the back of the head, no face visible), bottom-right is the other side. ` +
    `Keep the 2x2 grid, keep each panel's camera angle exactly (the bottom-left panel must stay a back view with no face), and keep the toy's pose. ` +
    `Repaint it as a hand-painted custom and ${want} ${sculpt} ` +
    `Repaint every surface with the new design; keep the old paint only where the design says so. ` +
    `It is ONE toy: every add-on has the same color, size and shape in all four panels, seen from that panel's angle. Make it look like a real painted toy, not a drawing. Replace the background with plain white.`;
}
function makeTitle() {
  const idea = $("#idea").value.trim();
  const t = idea || [...state.styles].join(" ") + " custom";
  return t.split(/\s+/).slice(0, 5).join(" ");
}

/* ---------- painting (free Hugging Face Spaces) ---------- */
const ENGINES = [
  { space: "black-forest-labs/FLUX.1-Kontext-Dev", call: (c, img, p) => c.predict("/infer", { input_image: img, prompt: p, seed: 0, randomize_seed: true, guidance_scale: 2.5, steps: 28 }) },
  { space: "Qwen/Qwen-Image-Edit", call: (c, img, p) => c.predict("/infer", { image: img, prompt: p, seed: 0, randomize_seed: true, true_guidance_scale: 4, num_inference_steps: 30, rewrite_prompt: false }) },
];
function friendly(err) {
  const m = String(err?.message || err || "");
  const wait = m.match(/try again in ([0-9:]+)/i);
  if (/quota/i.test(m)) return `You've used today's free painting time${wait ? ` (try again in ${wait[1]})` : ""}. Free time resets daily.`;
  if (/token|unauthor|401|403/i.test(m)) return "Your Hugging Face token didn't work. Check it in Settings.";
  if (/sleep|building|paused|runtime_error|CONFIG_ERROR/i.test(m)) return "The free painting tool is resting right now. Try again in a few minutes.";
  return "The free painting tool is busy. Try again in a minute.";
}
async function paint(gridBlob, prompt, onStatus) {
  const saved = store.get("hfToken");
  const token = saved.startsWith("hf_") ? saved : undefined;
  let lastErr;
  for (const eng of ENGINES) {
    try {
      onStatus(eng === ENGINES[0] ? "Painting your figure…" : "Trying a second free painter…");
      const c = await Client.connect(eng.space, token ? { token, hf_token: token } : {});
      const r = await eng.call(c, gridBlob, prompt);
      const out = r.data[0];
      const url = out?.url || out?.image?.url || (Array.isArray(out) && (out[0]?.image?.url || out[0]?.url));
      if (!url) throw new Error("No image came back");
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Download failed " + res.status);
      return await res.blob();
    } catch (e) {
      console.warn(eng.space, e); lastErr = e;
      if (/token|unauthor/i.test(String(e?.message))) break;
    }
  }
  throw lastErr;
}

/* ---------- Gemini (free text key) ---------- */
async function gemini(parts, json) {
  const key = store.get("gemKey");
  const body = { contents: [{ parts }], generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: "application/json" } : {}) } };
  let lastErr;
  for (const model of ["gemini-flash-latest", "gemini-2.5-flash"]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || r.status);
      const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      if (!txt.trim()) throw new Error("empty");
      return txt.trim();
    } catch (e) { lastErr = e; console.warn(model, e); }
  }
  throw lastErr;
}

// Turn the short idea into one exact recipe so all four sides get the same design.
const recipeCache = new Map();
async function designRecipe(gridBlob) {
  if (!store.get("gemKey")) return null;
  const k = [state.mode, state.sculpt, ideaText()].join("|");
  if (recipeCache.has(k)) return recipeCache.get(k);
  const b64 = (await blobToDataURL(gridBlob)).split(",")[1];
  const ask = `These 4 photos show one ${state.mode === "lps" ? "Littlest Pet Shop toy" : "miniature figure"} from the front, one side, the back, and the other side. ` +
    `The owner wants to customize it with this idea: "${ideaText()}". Rule: ${sculptRule()} ` +
    `Write one exact design recipe a painter could follow, with one short line per part in the form "part: description". ` +
    `Cover head, face markings, eyes, ears (inside and outside), body, chest, legs, paws, tail, and each add-on. ` +
    `For every add-on give its color, size, shape and exact placement, and say how it looks from the front, side and back. ` +
    `Use plain color names, pick ONE color per item and never offer alternatives. Keep the toy's eye style unless the idea changes it. Max 120 words, no intro.`;
  try {
    const r = await gemini([{ text: ask }, { inline_data: { mime_type: "image/jpeg", data: b64 } }], false);
    recipeCache.set(k, r); return r;
  } catch { return null; }
}

/* ---------- build plan ---------- */
async function makePlan(imageDataURL, ctx) {
  const key = store.get("gemKey"); if (!key) return null;
  const b64 = imageDataURL.split(",")[1];
  const ask = `You are an expert ${ctx.mode === "lps" ? "Littlest Pet Shop customizer" : "miniature painter"}. The image shows a painted design idea for a figure from four sides. The idea was: "${ctx.idea}". ` +
    `Write a practical build plan for a hobbyist using acrylic paints${ctx.mode === "lps" ? " and polymer or air-dry clay" : ""}. ` +
    `Return JSON with: "paints": array of {"name": short color name, "hex": "#rrggbb" matching the image, "where": which parts}, ` +
    `"clay": array of {"part": add-on name, "how": one sentence on shaping and attaching} (empty array if no add-ons), ` +
    `"steps": array of 4-8 short ordered steps, "tip": one beginner tip. Keep every string short.` +
    (ctx.recipe ? ` The design recipe was:
${ctx.recipe}` : "");
  const txt = await gemini([{ text: ask }, { inline_data: { mime_type: "image/jpeg", data: b64 } }], true);
  return JSON.parse(txt.replace(/^```json|```$/g, "").trim());
}

/* ---------- generate flow ---------- */
let timer;
async function generate() {
  state.lastMode = "free";
  goStep(3);
  $("#loadingCard").classList.remove("hide"); $("#failCard").classList.add("hide"); $("#resultBox").classList.add("hide"); $("#gemCard").classList.add("hide");
  const t0 = Date.now(); clearInterval(timer);
  timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $("#loadTime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 1000);
  try {
    const grid = await buildGrid();
    $("#loadMsg").textContent = "Planning the design…";
    const recipe = await designRecipe(grid);
    const prompt = buildPrompt(recipe);
    const out = await paint(grid, prompt, m => $("#loadMsg").textContent = m);
    clearInterval(timer);
    await finishDesign(out, recipe);
  } catch (e) {
    clearInterval(timer);
    $("#loadingCard").classList.add("hide");
    $("#failMsg").textContent = friendly(e);
    $("#failCard").classList.remove("hide");
  }
}

async function finishDesign(blob, recipe) {
  const image = await blobToDataURL(blob);
  const views = await splitViews(blob);
  const design = { id: "d" + Date.now(), date: Date.now(), title: makeTitle(), mode: state.mode, idea: $("#idea").value.trim() || [...state.styles].join(", "), image, views, recipe, plan: null, saved: false };
  state.current = design;
  $("#loadingCard").classList.add("hide"); $("#gemCard").classList.add("hide"); $("#failCard").classList.add("hide");
  renderResult($("#resultBox"), design, false);
  $("#resultBox").classList.remove("hide");
  loadPlan(design, $("#resultBox"));
}

/* ---------- Gemini mode: share out to the Gemini app, add the result back ---------- */
async function startGemini() {
  state.lastMode = "gemini";
  goStep(3);
  ["#loadingCard", "#failCard", "#resultBox"].forEach(id => $(id).classList.add("hide"));
  $("#gemCard").classList.remove("hide"); $("#gemMsg").textContent = "";
  $("#gemShare").disabled = true; $("#gemReady").textContent = "Getting your photos ready…";
  const grid = await buildGrid();
  if (store.get("gemKey")) $("#gemReady").textContent = "Planning the design…";
  const recipe = await designRecipe(grid);
  state.gem = { file: new File([grid], "minimuse-photos.jpg", { type: "image/jpeg" }), recipe,
    prompt: "Edit this image. " + buildPrompt(recipe) + " Return one image that keeps the same 2x2 grid layout." };
  $("#gemShare").disabled = false;
  $("#gemReady").textContent = recipe ? "Ready. Your design recipe is in the prompt." : "Ready.";
}
async function copyPrompt() {
  try { await navigator.clipboard.writeText(state.gem.prompt); return true; } catch { return false; }
}
function saveGrid() {
  const a = document.createElement("a"); a.href = URL.createObjectURL(state.gem.file); a.download = state.gem.file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$("#gemShare").onclick = async () => {
  if (!state.gem) return;
  const copied = await copyPrompt();
  const data = { files: [state.gem.file], text: state.gem.prompt, title: "MiniMuse" };
  if (navigator.canShare && navigator.canShare(data)) {
    try { await navigator.share(data); $("#gemMsg").textContent = ""; return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  saveGrid();
  $("#gemMsg").textContent = `Sharing isn't available here, so the photo was saved${copied ? " and the prompt copied" : ""}. Open Gemini, add the photo and paste the prompt.`;
};
$("#gemSaveGrid").onclick = () => state.gem && saveGrid();
$("#gemCopy").onclick = async () => { if (state.gem) $("#gemMsg").textContent = (await copyPrompt()) ? "Prompt copied." : "Couldn't copy. Try Send to Gemini."; };
$("#gemAdd").onclick = () => { $("#gemIn").value = ""; $("#gemIn").click(); };
$("#gemIn").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  await finishDesign(f, state.gem?.recipe || null);
  window.scrollTo(0, 0);
});
$("#gemBack").onclick = () => goStep(2);

async function loadPlan(design, box) {
  const slot = $(".planSlot", box); if (!slot) return;
  if (!store.get("gemKey")) { slot.innerHTML = `<p class="small muted">Add a free Gemini key in Settings to get a paint list and build steps.</p>`; return; }
  slot.innerHTML = `<p class="small muted">Writing your paint list…</p>`;
  try {
    design.plan = await makePlan(design.image, design);
    if (design.saved) await dbPut(design);
    slot.innerHTML = planHTML(design.plan);
  } catch (e) {
    slot.innerHTML = `<p class="small muted">Couldn't write the plan right now.</p><button class="btn retryPlan">Try again</button>`;
    $(".retryPlan", slot).onclick = () => loadPlan(design, box);
  }
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function planHTML(p) {
  if (!p) return "";
  const hex = h => /^#[0-9a-f]{6}$/i.test(h || "") ? h : "#ccc";
  let h = "";
  if (p.paints?.length) h += `<h3>Paints</h3>` + p.paints.map(x => `<div class="paint"><i class="sw" style="background:${hex(x.hex)}"></i><div><b>${esc(x.name)}</b><span>${esc(x.where)}</span></div></div>`).join("");
  if (p.clay?.length) h += `<h3>Clay add-ons</h3>` + p.clay.map(x => `<div class="paint"><i class="sw" style="background:var(--mustard-soft)"></i><div><b>${esc(x.part)}</b><span>${esc(x.how)}</span></div></div>`).join("");
  if (p.steps?.length) h += `<h3>Steps</h3><ol class="stepsl">${p.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>`;
  if (p.tip) h += `<p class="note sage" style="margin-top:10px">${esc(p.tip)}</p>`;
  return h;
}

function renderResult(box, d, fromGallery) {
  box.innerHTML = `
    <div class="card">
      <h2>${esc(d.title)}</h2>
      <p class="small muted" style="margin:2px 0 10px">${d.mode === "lps" ? "LPS custom" : "Miniature"} · ${new Date(d.date).toLocaleDateString()}</p>
      <img class="result-main" src="${d.image}" alt="Painted design from four sides">
      <div class="views">${d.views.map((v, i) => `<img src="${v}" data-v="${i}" alt="View ${i + 1}">`).join("")}</div>
      <p class="small muted" style="margin:6px 0 0">Tap a view to see it bigger.</p>
      ${d.recipe ? `<details style="margin-top:10px"><summary class="small">Design recipe</summary><p class="small" style="white-space:pre-line;margin:6px 0 0">${esc(d.recipe)}</p></details>` : ""}
      <div class="row" style="margin-top:12px">
        ${fromGallery
          ? `<button class="btn act-del">Delete</button><button class="btn primary act-dl">Download</button>`
          : `<button class="btn act-again">Try again</button><button class="btn act-tweak">Change idea</button><button class="btn primary act-save">${d.saved ? "Saved" : "Save"}</button>`}
      </div>
    </div>
    <div class="card plan"><h2>Build plan</h2><div class="planSlot">${d.plan ? planHTML(d.plan) : ""}</div></div>
    ${fromGallery ? "" : `<button class="btn block act-new">Start a new figure</button>`}`;
  $(".views", box).addEventListener("click", e => { const i = e.target.closest("img"); if (i) openViewer(i.src); });
  $(".result-main", box).addEventListener("click", () => openViewer(d.image));
  if (fromGallery) {
    $(".act-del", box).onclick = async () => { if (!confirm("Delete this design?")) return; await dbDel(d.id); renderGallery(); };
    $(".act-dl", box).onclick = () => { const a = document.createElement("a"); a.href = d.image; a.download = `minimuse-${d.title.replace(/\W+/g, "-")}.png`; a.click(); };
    if (!d.plan) loadPlan(d, box);
  } else {
    $(".act-again", box).onclick = () => state.lastMode === "gemini" ? startGemini() : generate();
    $(".act-tweak", box).onclick = () => goStep(2);
    $(".act-save", box).onclick = async e => { d.saved = true; await dbPut(d); e.target.textContent = "Saved"; };
    $(".act-new", box).onclick = () => { state.photos.forEach(p => p && URL.revokeObjectURL(p.url)); state.photos = [null, null, null, null]; renderSlots(); goStep(1); };
  }
}

/* ---------- gallery ---------- */
async function renderGallery() {
  $("#galleryDetail").classList.add("hide"); $("#galleryList").classList.remove("hide");
  const items = (await dbAll()).sort((a, b) => b.date - a.date);
  if (!items.length) {
    $("#galleryList").innerHTML = `<div class="card empty"><h3>Your saved designs live here</h3><p class="muted small">Make an idea in Create and tap Save.</p><button class="btn primary" id="goCreate">Create a design</button></div>`;
    $("#goCreate").onclick = () => showTab("create"); return;
  }
  $("#galleryList").innerHTML = `<div class="gallery">${items.map(d => `<button class="gitem" data-id="${d.id}"><img src="${d.views[0]}" alt=""><div><b>${esc(d.title)}</b><span class="muted">${d.mode === "lps" ? "LPS" : "Mini"} · ${new Date(d.date).toLocaleDateString()}</span></div></button>`).join("")}</div>`;
  $$(".gitem").forEach(b => b.onclick = () => {
    const d = items.find(x => x.id === b.dataset.id);
    $("#galleryList").classList.add("hide");
    const box = $("#galleryDetail"); box.classList.remove("hide");
    box.innerHTML = `<button class="btn ghost" id="galBack" style="margin-bottom:10px">← All designs</button><div></div>`;
    $("#galBack").onclick = renderGallery;
    renderResult(box.lastElementChild, d, true);
    window.scrollTo(0, 0);
  });
}

/* ---------- viewer ---------- */
function openViewer(src) { $("#viewerImg").src = src; $("#viewer").classList.remove("hide"); }
$("#viewerClose").onclick = () => $("#viewer").classList.add("hide");
$("#viewer").addEventListener("click", e => { if (e.target.id === "viewer") $("#viewer").classList.add("hide"); });

/* ---------- settings ---------- */
$("#hfToken").value = store.get("hfToken");
$("#gemKey").value = store.get("gemKey");
$("#saveKeys").onclick = () => {
  store.set("hfToken", $("#hfToken").value.trim()); store.set("gemKey", $("#gemKey").value.trim());
  $("#keysMsg").textContent = "Saved on this device.";
};

renderSlots();
