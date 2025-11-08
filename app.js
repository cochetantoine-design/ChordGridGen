/* ChordGridGen - JS (updated: exportPrintable shows only title, BPM, part names, measures with chords and comments; chords rendered at 12pt in PDF)
 - Undo/Redo history and other features preserved.
*/

/* ---------- Configuration ---------- */
const ROOTS = ["A","Bb","B","C","C#","D","Eb","E","F","F#","G","Ab"];
const ALLOWED_SUFFIXES = ["M7","m","7","°7","5","sus2","sus4"]; // can combine

/* ---------- App State ---------- */
let state = {
  title: "Titre",
  tempo: 120,
  comments: "",
  parts: [] // each part: {id, name, measuresTotal, measuresPerLine, measures: [{chord, split}]}
};

// clipboard fallback (if navigator.clipboard not available)
let lastCopiedPartJson = null;

/* ---------- Mesure copier/coller ---------- */
let copiedMeasure = null;

/* ---------- History (undo/redo) ---------- */
const history = {
  snapshots: [],
  index: -1,
  max: 200
};
function deepCloneState(s){ return JSON.parse(JSON.stringify(s)); }

function resetHistory(){
  history.snapshots = [];
  history.index = -1;
  saveHistorySnapshot();
}
function updateUndoRedoButtons(){
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if(undoBtn) undoBtn.disabled = !(history.index > 0);
  if(redoBtn) redoBtn.disabled = !(history.index < history.snapshots.length - 1);
}

/* ---------- Helpers ---------- */
const uid = () => Math.random().toString(36).slice(2,9);
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function createEmptyPart(name = "Part", measuresTotal = 8, measuresPerLine = 4){
  const id = uid();
  const measures = Array.from({length: measuresTotal}, ()=>({chord:"", split:false}));
  return { id, name, measuresTotal, measuresPerLine, measures };
}

/* ---------- Init ---------- */
function init(){
  state.title = "Titre du morceau";
  state.tempo = 120;
  state.comments = "";
  state.parts = [
    createEmptyPart("Intro", 8, 4),
    createEmptyPart("Couplet", 8, 4),
    createEmptyPart("Refrain", 8, 4),
  ];
  bindUI();
  // initialize history with this initial state
  history.snapshots = [];
  history.index = -1;
  saveHistorySnapshot();
  renderAll();
}

/* ---------- UI binding ---------- */
function bindUI(){
  addPartBtn.onclick = ()=> {
    const part = createEmptyPart("Part " + (state.parts.length+1), 8, 4);
    state.parts.push(part);
    saveHistorySnapshot();
    renderAll();
  };

  songTitleInput.oninput = (e) => { state.title = e.target.value; };
  songTitleInput.onblur = ()=> saveHistorySnapshot();

  tempoInput.oninput = (e) => { state.tempo = parseInt(e.target.value) || 0; };
  tempoInput.onchange = ()=> saveHistorySnapshot();

  commentsInput.oninput = (e) => { state.comments = e.target.value; };
  commentsInput.onblur = ()=> saveHistorySnapshot();

  transposeUpBtn.onclick = ()=> { transposeAll(1); saveHistorySnapshot(); };
  transposeDownBtn.onclick = ()=> { transposeAll(-1); saveHistorySnapshot(); };

  saveBtn.onclick = saveJSON;
  loadBtn.onclick = ()=> fileInput.click();
  fileInput.onchange = handleFileLoad;

  newBtn.onclick = ()=> {
    if(!confirm("Nouvelle grille : tout le travail non sauvegardé sera perdu. Continuer ?")) return;
    init();
  };

  exportBtn.onclick = ()=> { exportPrintable(); };

  pastePartBtn.onclick = async ()=>{
    try {
      if(navigator.clipboard && navigator.clipboard.readText){
        const text = await navigator.clipboard.readText();
        tryPastePartText(text);
        saveHistorySnapshot();
      } else if(lastCopiedPartJson){
        tryPastePartText(lastCopiedPartJson);
        saveHistorySnapshot();
      } else {
        alert("Aucun contenu copié trouvé.");
      }
    } catch(err){
      if(lastCopiedPartJson) { tryPastePartText(lastCopiedPartJson); saveHistorySnapshot(); }
      else alert("Impossible de coller depuis le presse-papier : " + err.message);
    }
  };

  undoBtn.onclick = () => { undo(); };
  redoBtn.onclick = () => { redo(); };
}

function escapeHtml(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---------- Rendering ---------- */
function renderAll(){
  songTitleInput.value = state.title;
  tempoInput.value = state.tempo;
  commentsInput.value = state.comments || "";

  renderPartsList();
  renderGrid();
  pastePartBtn.disabled = !(lastCopiedPartJson || (navigator.clipboard && navigator.clipboard.readText));
  updateUndoRedoButtons();
}

function renderPartsList(){
  partsListEl.innerHTML = "";
  state.parts.forEach((p, idx) => {
    const el = document.createElement("div");
    el.className = "part-item";
    el.draggable = true;
    el.dataset.partId = p.id;

    el.innerHTML = `
      <div class="part-meta">
        <input data-part-id="${p.id}" class="part-name" value="${escapeHtml(p.name)}" />
        <div style="display:flex; gap:6px; font-size:12px;">
          <label>Mesures total: <input type="number" data-measures="${p.id}" value="${p.measuresTotal}" min="1" style="width:60px" /></label>
          <label>Par ligne: <input type="number" data-perline="${p.id}" value="${p.measuresPerLine}" min="1" max="10" style="width:60px" /></label>
        </div>
      </div>
      <div class="part-actions">
        <button data-dup="${p.id}">Dupliquer</button>
        <button data-copy="${p.id}">Copier</button>
        <button data-del="${p.id}">Supprimer</button>
      </div>
    `;

    // events
    const nameInput = el.querySelector(".part-name");
    nameInput.oninput = (e)=>{
      const id = e.target.dataset.partId;
      const part = state.parts.find(x=>x.id===id);
      if(part) { part.name = e.target.value; renderGrid(); }
    };
    nameInput.onblur = ()=> saveHistorySnapshot();

    const totalInput = el.querySelector(`input[data-measures="${p.id}"]`);
    const perlineInput = el.querySelector(`input[data-perline="${p.id}"]`);
    totalInput.onchange = (e)=>{
      const val = clamp(parseInt(e.target.value)||1, 1, 200);
      const part = state.parts.find(x=>x.id===p.id);
      if(part){
        if(val > part.measuresTotal){
          for(let i=0;i<val-part.measuresTotal;i++) part.measures.push({chord:"", split:false});
        } else if(val < part.measuresTotal){
          part.measures.splice(val);
        }
        part.measuresTotal = val;
        saveHistorySnapshot();
        renderAll();
      }
    };
    perlineInput.onchange = (e)=>{
      const val = clamp(parseInt(e.target.value)||1, 1, 10);
      const part = state.parts.find(x=>x.id===p.id);
      if(part){
        part.measuresPerLine = val;
        saveHistorySnapshot();
        renderAll();
      }
    };

    const dupBtn = el.querySelector(`[data-dup="${p.id}"]`);
    dupBtn.onclick = ()=> {
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = uid();
      copy.name = p.name + " (copie)";
      state.parts.splice(idx+1, 0, copy);
      saveHistorySnapshot();
      renderAll();
    };

    const copyBtn = el.querySelector(`[data-copy="${p.id}"]`);
    copyBtn.onclick = async ()=> {
      const part = state.parts.find(x=>x.id===p.id);
      if(!part) return;
      const text = JSON.stringify(part);
      lastCopiedPartJson = text;
      try {
        if(navigator.clipboard && navigator.clipboard.writeText){
          await navigator.clipboard.writeText(text);
        }
        alert("Partie copiée dans le presse-papier.");
      } catch(err){
        alert("Copie locale enregistrée (événement). Vous pouvez coller avec 'Coller partie'.");
      }
      pastePartBtn.disabled = false;
    };

    const delBtn = el.querySelector(`[data-del="${p.id}"]`);
    delBtn.onclick = ()=> {
      if(!confirm("Supprimer cette partie ?")) return;
      state.parts.splice(idx,1);
      saveHistorySnapshot();
      renderAll();
    };

    // Drag & drop handlers
    el.addEventListener("dragstart", (ev)=>{
      ev.dataTransfer.setData("text/plain", p.id);
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", ()=> el.classList.remove("dragging"));
    el.addEventListener("dragover", (ev)=> ev.preventDefault());
    el.addEventListener("drop", (ev)=>{
      ev.preventDefault();
      const srcId = ev.dataTransfer.getData("text/plain");
      if(!srcId) return;
      const from = state.parts.findIndex(x=>x.id===srcId);
      const to = state.parts.findIndex(x=>x.id===p.id);
      if(from<0 || to<0) return;
      const [item] = state.parts.splice(from,1);
      state.parts.splice(to,0,item);
      saveHistorySnapshot();
      renderAll();
    });

    partsListEl.appendChild(el);
  });
}

function renderGrid(){
  gridContainer.innerHTML = "";
  state.parts.forEach((p, partIdx)=>{
    const wrapper = document.createElement("div");
    wrapper.className = "part-render";

    const label = document.createElement("div");
    label.className = "part-label";
    label.textContent = p.name;

    const block = document.createElement("div");
    block.className = "measures-block";

    const perLine = clamp(p.measuresPerLine, 1, 10);
    const total = p.measuresTotal;
    for(let lineStart=0; lineStart<total; lineStart += perLine){
      const line = document.createElement("div");
      line.className = "measures-line";
      const lineEnd = Math.min(lineStart + perLine, total);
      for(let i=lineStart; i<lineEnd; i++){
        const measureEl = createMeasureSVG(p, i, partIdx);
        line.appendChild(measureEl);
      }
      block.appendChild(line);
    }

    wrapper.appendChild(label);
    wrapper.appendChild(block);
    gridContainer.appendChild(wrapper);
  });
}

/* ---------- Measure creation and controls ---------- */
function createMeasureSVG(part, index, partIdx){
  const m = part.measures[index];
  const el = document.createElement("div");
  el.className = "measure";
  const bgClass = (m.chord && m.chord.trim() !== "") ? "bg-filled" : "bg-empty";
  el.classList.add(bgClass);

  // SVG
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox","0 0 100 100");
  svg.setAttribute("preserveAspectRatio","none");

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x","0"); rect.setAttribute("y","0");
  rect.setAttribute("width","100"); rect.setAttribute("height","100");
  rect.setAttribute("fill", m.chord && m.chord.trim()!=="" ? "#ffffff" : "#CECECE");
  rect.setAttribute("stroke","#000");
  svg.appendChild(rect);

  if(m.split){
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1","0"); line.setAttribute("y1","100");
    line.setAttribute("x2","100"); line.setAttribute("y2","0");
    line.setAttribute("stroke","#000");
    line.setAttribute("stroke-width","1");
    svg.appendChild(line);

    if(m.chord && m.chord.includes("|")){
      const parts = m.chord.split("|");
      const top = parts[0].trim();
      const bottom = parts[1].trim();

      const topText = document.createElementNS(ns,"text");
      topText.setAttribute("x","30");
      topText.setAttribute("y","35");
      topText.setAttribute("class","chord-text");
      topText.textContent = top;
      svg.appendChild(topText);

      const botText = document.createElementNS(ns,"text");
      botText.setAttribute("x","70");
      botText.setAttribute("y","65");
      botText.setAttribute("class","chord-text");
      botText.textContent = bottom;
      svg.appendChild(botText);
    } else {
      const t = document.createElementNS(ns,"text");
      t.setAttribute("x","50"); t.setAttribute("y","50");
      t.setAttribute("class","chord-text");
      t.textContent = m.chord || "";
      svg.appendChild(t);
    }
  } else {
    if(m.chord && m.chord.trim() !== ""){
      const text = document.createElementNS(ns,"text");
      text.setAttribute("x","50"); text.setAttribute("y","50");
      text.setAttribute("class","chord-text");
      text.textContent = m.chord;
      svg.appendChild(text);
    }
  }

  el.appendChild(svg);

  // interactions: right-click for context and double-click to edit
  const overlay = document.createElement("div");
  overlay.className = "measure-click-layer";
  overlay.title = "Double-clic pour éditer / clique droit pour options";
  overlay.oncontextmenu = (ev)=> { ev.preventDefault(); showMeasureContextMenu(ev, part, index); };
  overlay.ondblclick = (ev)=> { ev.preventDefault(); openEditDialog(part, index); };
  el.appendChild(overlay);

  return el;
}

/* ---------- Measure editing / context ---------- */
function showMeasureContextMenu(ev, part, index){
  const menu = document.createElement("div");
  menu.style.position = "fixed";
  menu.style.left = ev.clientX + "px";
  menu.style.top = ev.clientY + "px";
  menu.style.background = "#fff";
  menu.style.border = "1px solid #ccc";
  menu.style.padding = "6px";
  menu.style.zIndex = 9999;
  menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";

  // Bouton Copier
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copier";
  copyBtn.onclick = () => {
    const m = part.measures[index];
    copiedMeasure = { chord: m.chord, split: m.split };
    document.body.removeChild(menu);
  };

  // Bouton Coller
  const pasteBtn = document.createElement("button");
  pasteBtn.textContent = "Coller";
  pasteBtn.disabled = !copiedMeasure;
  pasteBtn.onclick = () => {
    if (copiedMeasure) {
      part.measures[index].chord = copiedMeasure.chord;
      part.measures[index].split = copiedMeasure.split;
      saveHistorySnapshot();
      renderAll();
    }
    document.body.removeChild(menu);
  };

  const toggle = document.createElement("button");
  toggle.textContent = part.measures[index].split ? "Enlever split" : "Split 2 accords";
  toggle.onclick = ()=>{
    part.measures[index].split = !part.measures[index].split;
    document.body.removeChild(menu);
    saveHistorySnapshot();
    renderAll();
  };

  const edit = document.createElement("button");
  edit.textContent = "Éditer accord(s)";
  edit.onclick = ()=>{
    document.body.removeChild(menu);
    openEditDialog(part, index);
  };

  const clear = document.createElement("button");
  clear.textContent = "Effacer";
  clear.onclick = ()=>{
    part.measures[index].chord = "";
    part.measures[index].split = false;
    document.body.removeChild(menu);
    saveHistorySnapshot();
    renderAll();
  };

  // Ajout des boutons dans l'ordre souhaité
  menu.appendChild(copyBtn);
  menu.appendChild(pasteBtn);
  menu.appendChild(toggle);
  menu.appendChild(edit);
  menu.appendChild(clear);

  document.body.appendChild(menu);
  const cleanup = ()=> { if(document.body.contains(menu)) document.body.removeChild(menu); };
  setTimeout(()=> window.addEventListener("click", cleanup, { once:true }), 0);
}

function openEditDialog(part, index){
  const m = part.measures[index];
  const current = m.chord || "";
  let input = prompt("Saisir accord (pour split: 'Accord1|Accord2'). Ex: Abm7  ou  C|G", current);
  if(input === null) return;
  input = input.trim();
  if(input.includes("|")){
    const parts = input.split("|").map(s=>s.trim());
    if(parts.some(p=>!validateChordOrEmpty(p))){
      alert("Accord invalide. Racines acceptées: " + ROOTS.join(", "));
      return;
    }
    m.chord = parts.join("|");
    m.split = true;
  } else {
    if(!validateChordOrEmpty(input) && input !== ""){
      alert("Accord invalide. Racines acceptées: " + ROOTS.join(", "));
      return;
    }
    m.chord = input;
    m.split = false;
  }
  saveHistorySnapshot();
  renderAll();
}

/* ...reste du fichier inchangé... */