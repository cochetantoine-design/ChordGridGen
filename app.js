// ChordGridGen — basic implementation
// Author: Copilot-style implementation for initial repo
// Behaviour implemented:
// - create parts (name, total measures, measuresPerLine)
// - duplicate, reorder, delete parts
// - edit measures (single or split), option oval
// - transpose up/down over scale A Bb B C C# D Eb E F F# G Ab
// - save/load JSON, new (reset), export via print
// - undo/redo snapshots

(() => {
  // State
  let state = {
    title: 'Untitled',
    tempo: 120,
    parts: [],
    comments: ''
  };

  // Undo/Redo
  const history = [];
  let historyIndex = -1;
  function pushHistory() {
    // drop future
    history.splice(historyIndex + 1);
    history.push(JSON.parse(JSON.stringify(state)));
    historyIndex = history.length - 1;
    updateUndoRedoButtons();
  }
  function restoreFromHistory(idx) {
    if (idx < 0 || idx >= history.length) return;
    state = JSON.parse(JSON.stringify(history[idx]));
    historyIndex = idx;
    renderAll();
    updateUndoRedoButtons();
  }
  function updateUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = historyIndex <= 0;
    document.getElementById('btn-redo').disabled = historyIndex >= history.length - 1;
  }

  // Scale for transposition
  const SCALE = ['A','Bb','B','C','C#','D','Eb','E','F','F#','G','Ab'];
  function normalizeRoot(r){
    if(!r) return '';
    // Standardize alternates: use Bb instead of A# etc. We'll accept only the provided names.
    const map = {'A#':'Bb','Db':'C#','D#':'Eb','Gb':'F#','G#':'Ab','Cb':'B','E#':'F'};
    return map[r] || r;
  }
  function transposeChordString(s, step){
    // s can be like "Abm7" or "F#sus4" or empty string
    if(!s || !s.trim()) return s;
    s = s.trim();
    // match root at beginning
    const rootRegex = /^(A#|Bb|A|B|C#|Db|C|D#|Eb|D|E#|E|F#|Gb|F|G#|Ab|G|Cb)?/i;
    const m = s.match(rootRegex);
    if(!m) return s;
    let root = m[0];
    if(!root) return s; // no root found
    // Standardize some enharmonics
    root = normalizeRoot(root.charAt(0).toUpperCase() + root.slice(1));
    // suffix is rest
    const suffix = s.slice(m[0].length);
    const idx = SCALE.findIndex(x => x.toLowerCase() === root.toLowerCase());
    if(idx === -1) return s;
    const newRoot = SCALE[(idx + step + SCALE.length) % SCALE.length];
    return newRoot + suffix;
  }

  // DOM refs
  const partsListEl = document.getElementById('parts-list');
  const partNameInput = document.getElementById('part-name');
  const partTotalInput = document.getElementById('part-total');
  const partPerLineInput = document.getElementById('part-per-line');
  const selectedSettingsPanel = document.getElementById('selected-part-settings');
  const btnAddPart = document.getElementById('btn-add-part');
  const btnDuplicate = document.getElementById('btn-duplicate-part');
  const btnMoveUp = document.getElementById('btn-move-up');
  const btnMoveDown = document.getElementById('btn-move-down');
  const btnDeletePart = document.getElementById('btn-delete-part');
  const partsContainer = document.getElementById('parts-list');

  const pageLeft = document.getElementById('page-left-column');
  const pageGrid = document.getElementById('page-grid');

  const songTitleInput = document.getElementById('song-title');
  const tempoInput = document.getElementById('tempo');
  const commentsInput = document.getElementById('comments');

  const fileInput = document.getElementById('file-input');

  let selectedPartIndex = null;
  let editingCell = null; // {partIndex, measureIndex}

  // Editor modal
  const editor = document.getElementById('editor');
  const editorSplit = document.getElementById('editor-split');
  const editorChord1 = document.getElementById('editor-chord1');
  const editorChord2Row = document.getElementById('editor-chord2-row');
  const editorChord2 = document.getElementById('editor-chord2');
  const editorOval = document.getElementById('editor-oval');

  // init
  function init() {
    bindUI();
    // start with one default part
    state = {
      title: 'Titre du morceau',
      tempo: 120,
      parts: [{
        name: 'Intro',
        totalMeasures: 8,
        measuresPerLine: 4,
        measures: makeMeasuresArray(8)
      }],
      comments: ''
    };
    pushHistory();
    renderAll();
  }

  function makeMeasuresArray(n){
    const arr = [];
    for(let i=0;i<n;i++){
      arr.push({ split:false, chord1:'', chord2:'', oval:false });
    }
    return arr;
  }

  function bindUI(){
    btnAddPart.addEventListener('click', () => {
      const name = prompt('Nom de la nouvelle partie', 'New Part');
      if(!name) return;
      const total = parseInt(prompt('Total mesures', '8') || '8',10) || 8;
      const perLine = parseInt(prompt('Mesures par ligne (1-10)', '4') || '4',10);
      addPart({name, totalMeasures: total, measuresPerLine: Math.min(10, Math.max(1,perLine)), measures: makeMeasuresArray(total)});
      pushHistory();
    });

    partsContainer.addEventListener('click', (e)=>{
      const id = e.target.closest('.part-item')?.dataset?.index;
      if(id !== undefined) {
        selectPart(parseInt(id,10));
      }
      // select via button actions
      const btn = e.target.closest('button[data-action]');
      if(btn){
        const idx = parseInt(btn.closest('.part-item').dataset.index,10);
        const action = btn.dataset.action;
        if(action==='dup'){ duplicatePart(idx); pushHistory(); }
        if(action==='up'){ movePartUp(idx); pushHistory(); }
        if(action==='down'){ movePartDown(idx); pushHistory(); }
        if(action==='del'){ deletePart(idx); pushHistory(); }
      }
    });

    partNameInput.addEventListener('input', ()=> {
      if(selectedPartIndex===null) return;
      state.parts[selectedPartIndex].name = partNameInput.value;
      renderAll();
      pushHistory();
    });
    partTotalInput.addEventListener('change', ()=> {
      if(selectedPartIndex===null) return;
      let t = parseInt(partTotalInput.value,10);
      if(isNaN(t) || t<1) t=1;
      const p = state.parts[selectedPartIndex];
      // adjust measures array
      if(t > p.measures.length){
        const add = makeMeasuresArray(t - p.measures.length);
        p.measures = p.measures.concat(add);
      } else if (t < p.measures.length){
        p.measures = p.measures.slice(0,t);
      }
      p.totalMeasures = t;
      partTotalInput.value = t;
      renderAll();
      pushHistory();
    });
    partPerLineInput.addEventListener('change', ()=> {
      if(selectedPartIndex===null) return;
      let v = parseInt(partPerLineInput.value,10);
      if(isNaN(v) || v<1) v=1;
      if(v>10)v=10;
      state.parts[selectedPartIndex].measuresPerLine = v;
      partPerLineInput.value = v;
      renderAll();
      pushHistory();
    });

    document.getElementById('btn-duplicate-part').addEventListener('click', ()=>{ if(selectedPartIndex!==null){ duplicatePart(selectedPartIndex); pushHistory(); }});
    document.getElementById('btn-move-up').addEventListener('click', ()=>{ if(selectedPartIndex!==null){ movePartUp(selectedPartIndex); pushHistory(); }});
    document.getElementById('btn-move-down').addEventListener('click', ()=>{ if(selectedPartIndex!==null){ movePartDown(selectedPartIndex); pushHistory(); }});
    document.getElementById('btn-delete-part').addEventListener('click', ()=>{ if(selectedPartIndex!==null){ if(confirm('Supprimer cette partie ?')){ deletePart(selectedPartIndex); pushHistory(); }}});

    songTitleInput.addEventListener('input', ()=>{ state.title = songTitleInput.value; pushHistory(); });
    tempoInput.addEventListener('change', ()=>{ state.tempo = parseInt(tempoInput.value,10) || 120; pushHistory(); });
    commentsInput.addEventListener('input', ()=>{ state.comments = commentsInput.value; pushHistory(); });

    document.getElementById('btn-save').addEventListener('click', saveJSON);
    document.getElementById('btn-load').addEventListener('click', ()=> fileInput.click());
    fileInput.addEventListener('change', handleFileLoad);

    document.getElementById('btn-new').addEventListener('click', ()=>{
      if(!confirm('Réinitialiser la page et supprimer le travail en cours ?')) return;
      state = {title:'Titre du morceau', tempo:120, parts: [], comments:''};
      pushHistory();
      renderAll();
    });

    document.getElementById('btn-undo').addEventListener('click', ()=> {
      if(historyIndex>0) restoreFromHistory(historyIndex-1);
    });
    document.getElementById('btn-redo').addEventListener('click', ()=> {
      if(historyIndex < history.length-1) restoreFromHistory(historyIndex+1);
    });

    document.getElementById('btn-transpose-up').addEventListener('click', ()=>{ transposeAll(1); pushHistory();});
    document.getElementById('btn-transpose-down').addEventListener('click', ()=>{ transposeAll(-1); pushHistory();});

    document.getElementById('btn-export').addEventListener('click', ()=> {
      // hide controls via print CSS and call print
      window.print();
    });

    // grid interactions: delegated
    pageGrid.addEventListener('click', (e)=>{
      const cell = e.target.closest('.measure');
      if(!cell) return;
      const partIndex = parseInt(cell.dataset.partIndex,10);
      const measureIndex = parseInt(cell.dataset.measureIndex,10);
      openEditorFor(partIndex, measureIndex);
    });

    // Editor bindings
    editorSplit.addEventListener('change', ()=> {
      editorChord2Row.style.display = editorSplit.checked ? 'block' : 'none';
    });
    document.getElementById('editor-save').addEventListener('click', ()=> {
      if(!editingCell) { closeEditor(); return; }
      const p = state.parts[editingCell.partIndex];
      const m = p.measures[editingCell.measureIndex];
      m.split = editorSplit.checked;
      m.chord1 = editorChord1.value.trim();
      m.chord2 = editorChord2.value.trim();
      m.oval = editorOval.checked;
      // mark filled if any chord present
      // (We treat filled as any chord1 or chord2 non-empty)
      renderAll();
      pushHistory();
      closeEditor();
    });
    document.getElementById('editor-cancel').addEventListener('click', ()=> {
      closeEditor();
    });
  }

  function addPart(part){
    state.parts.push(part);
    renderAll();
    pushHistory();
  }
  function duplicatePart(idx){
    const src = state.parts[idx];
    const copy = JSON.parse(JSON.stringify(src));
    copy.name = copy.name + ' (copy)';
    state.parts.splice(idx+1,0,copy);
    renderAll();
  }
  function movePartUp(idx){
    if(idx<=0) return;
    const a = state.parts.splice(idx,1)[0];
    state.parts.splice(idx-1,0,a);
    selectPart(idx-1);
    renderAll();
  }
  function movePartDown(idx){
    if(idx >= state.parts.length-1) return;
    const a = state.parts.splice(idx,1)[0];
    state.parts.splice(idx+1,0,a);
    selectPart(idx+1);
    renderAll();
  }
  function deletePart(idx){
    state.parts.splice(idx,1);
    selectedPartIndex = null;
    renderAll();
  }

  function selectPart(idx){
    selectedPartIndex = idx;
    renderAll();
    // fill settings panel
    if(idx===null || idx===undefined){
      selectedSettingsPanel.style.display = 'none';
      return;
    }
    selectedSettingsPanel.style.display = 'block';
    const p = state.parts[idx];
    partNameInput.value = p.name;
    partTotalInput.value = p.totalMeasures || p.measures.length;
    partPerLineInput.value = p.measuresPerLine || 4;
  }

  function renderAll(){
    // header
    songTitleInput.value = state.title || '';
    tempoInput.value = state.tempo || 120;
    commentsInput.value = state.comments || '';

    // parts list (controls area)
    partsContainer.innerHTML = '';
    state.parts.forEach((p,idx)=>{
      const div = document.createElement('div');
      div.className = 'part-item' + (selectedPartIndex===idx ? ' selected':'');
      div.dataset.index = idx;
      div.innerHTML = `
        <div style="flex:1; padding-right:6px;">${escapeHtml(p.name)}</div>
        <div style="display:flex; gap:4px">
          <button data-action="dup" title="Dupliquer">⧉</button>
          <button data-action="up" title="Monter">↑</button>
          <button data-action="down" title="Descendre">↓</button>
          <button data-action="del" title="Supprimer">✕</button>
        </div>
      `;
      partsContainer.appendChild(div);
    });

    // render page's left column and grid
    pageLeft.innerHTML = '';
    pageGrid.innerHTML = '';

    state.parts.forEach((p,idx) => {
      const total = p.totalMeasures || p.measures.length;
      // left part name area (one per part, height depends on grid height)
      const partRowDiv = document.createElement('div');
      partRowDiv.className = 'part-row';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'part-name';
      nameDiv.textContent = p.name;
      partRowDiv.appendChild(nameDiv);

      const gridWrapper = document.createElement('div');
      gridWrapper.className = 'part-grid';

      const perLine = p.measuresPerLine || 4;
      const rows = Math.ceil(total / perLine);
      for(let r=0;r<rows;r++){
        const rowDiv = document.createElement('div');
        rowDiv.className = 'measure-row';
        for(let c=0;c<perLine;c++){
          const mIndex = r*perLine + c;
          if(mIndex >= total) break;
          const measureData = p.measures[mIndex] || {split:false,chord1:'',chord2:'',oval:false};
          const m = document.createElement('div');
          m.className = 'measure' + ((measureData.chord1 || measureData.chord2) ? ' filled':'');
          if(measureData.split) m.classList.add('split');
          m.dataset.partIndex = idx;
          m.dataset.measureIndex = mIndex;

          // content rendering
          if(measureData.split){
            // use SVG diagonal
            m.innerHTML = `
              <svg class="split-svg" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="0,100 100,0" fill="none" stroke="#000" stroke-width="2"/>
              </svg>
              <div class="split-text top-left">${escapeHtml(measureData.chord1 || '')}</div>
              <div class="split-text bottom-right">${escapeHtml(measureData.chord2 || '')}</div>
            `;
            // if oval requested, show oval for first or second when present: show on top-left if chord1 only; if both and oval true show both in small ovals
            if(measureData.oval){
              // replace texts with ovals
              const tl = m.querySelector('.split-text.top-left');
              const br = m.querySelector('.split-text.bottom-right');
              if(tl) tl.innerHTML = `<span class="chord-oval">${escapeHtml(measureData.chord1 || '')}</span>`;
              if(br) br.innerHTML = `<span class="chord-oval">${escapeHtml(measureData.chord2 || '')}</span>`;
              // keep background grey behind shapes as per spec: we keep measure with transparent background; but requirement said oval inside a square with gray background — if oval is used we make background gray
              m.style.background = getComputedStyle(document.documentElement).getPropertyValue('--gray');
            }
          } else {
            // single chord display
            if(measureData.oval && (measureData.chord1 || measureData.chord2)){
              // show an oval with the chord text (prefer chord1)
              const chord = measureData.chord1 || measureData.chord2 || '';
              m.innerHTML = `<span class="chord-oval">${escapeHtml(chord)}</span>`;
              // put background gray behind oval when empty? The spec: user must be able to place in a measure the letter in an oval inside a square with gray background. We'll set background gray if oval is used.
              m.style.background = getComputedStyle(document.documentElement).getPropertyValue('--gray');
              if(!chord) m.classList.remove('filled');
              else m.classList.add('filled');
            } else {
              // ordinary text centered
              m.textContent = measureData.chord1 || '';
              if(measureData.chord1) {
                m.classList.add('filled');
                m.style.background = 'var(--filled-bg)';
              } else {
                m.classList.remove('filled');
                m.style.background = 'var(--gray)';
              }
            }
          }
          rowDiv.appendChild(m);
        }
        gridWrapper.appendChild(rowDiv);
      }

      partRowDiv.appendChild(gridWrapper);
      pageGrid.appendChild(partRowDiv);
    });

    updateUndoRedoButtons();
  }

  function openEditorFor(partIndex, measureIndex){
    editingCell = {partIndex, measureIndex};
    const m = state.parts[partIndex].measures[measureIndex];
    editorSplit.checked = !!m.split;
    editorChord1.value = m.chord1 || '';
    editorChord2.value = m.chord2 || '';
    editorOval.checked = !!m.oval;
    editorChord2Row.style.display = editorSplit.checked ? 'block':'none';
    editor.setAttribute('aria-hidden','false');
  }
  function closeEditor(){
    editingCell = null;
    editor.setAttribute('aria-hidden','true');
  }

  function transposeAll(step){
    state.parts.forEach(p=>{
      p.measures.forEach(m=>{
        if(m.chord1) m.chord1 = transposeChordString(m.chord1, step);
        if(m.chord2) m.chord2 = transposeChordString(m.chord2, step);
      });
    });
    renderAll();
  }

  function saveJSON(){
    const filename = (state.title || 'song').replace(/\s+/g,'_') + '.json';
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function handleFileLoad(e){
    const f = e.target.files[0];
    if(!f) return;
    const fr = new FileReader();
    fr.onload = (ev)=>{
      try{
        const obj = JSON.parse(ev.target.result);
        if(typeof obj === 'object'){
          // basic validation
          state = obj;
          pushHistory();
          renderAll();
        } else {
          alert('Fichier JSON invalide');
        }
      }catch(err){
        alert('Erreur lecture JSON: ' + err.message);
      }
    };
    fr.readAsText(f);
    // reset input
    fileInput.value = '';
  }

  // helpers
  function escapeHtml(s){
    if(!s && s!==0) return '';
    return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  // initialize and listen for clicks outside
  init();

  // Expose for debug
  window.ChordGridGen = {
    getState: ()=> state,
    setState: (s)=> { state = s; pushHistory(); renderAll(); }
  };
})();