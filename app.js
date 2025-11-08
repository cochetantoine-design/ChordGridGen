// app.js — gestion copier/coller JSON pour les mesures
(() => {
  // Presse-papiers interne (fallback si lecture système impossible)
  let internalClipboard = null;

  // Utilitaires UI
  const toastEl = document.getElementById('toast');
  function showToast(txt, ms = 2400){
    toastEl.textContent = txt;
    toastEl.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toastEl.hidden = true, ms);
  }

  // Modal confirmation/aperçu
  const confirmModal = document.getElementById('confirm-modal');
  const previewJsonEl = document.getElementById('preview-json');
  const acceptBtn = document.getElementById('confirm-accept');
  const cancelBtn = document.getElementById('confirm-cancel');
  function showConfirmPreview(obj, onAccept){
    previewJsonEl.textContent = JSON.stringify(obj, null, 2);
    confirmModal.hidden = false;
    acceptBtn.focus();
    function cleanup(){
      confirmModal.hidden = true;
      acceptBtn.removeEventListener('click', acceptHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
    }
    function acceptHandler(){
      cleanup();
      onAccept(true);
    }
    function cancelHandler(){
      cleanup();
      onAccept(false);
    }
    acceptBtn.addEventListener('click', acceptHandler);
    cancelBtn.addEventListener('click', cancelHandler);
  }

  // Affichage JSON dans la mesure
  function renderMeasure(el){
    const pre = el.querySelector('.measure-json');
    try{
      const data = JSON.parse(el.getAttribute('data-json') || '{}');
      pre.textContent = JSON.stringify(data, null, 2);
    }catch(e){
      pre.textContent = el.getAttribute('data-json') || '';
    }
  }

  // Initial render
  document.querySelectorAll('.measure').forEach(renderMeasure);

  // Helpers clipboard
  async function writeClipboard(text){
    // tente l'API moderne
    if (navigator.clipboard && navigator.clipboard.writeText){
      try{
        await navigator.clipboard.writeText(text);
        return {ok:true, via:'system'};
      }catch(e){
        // chute vers fallback
      }
    }
    // fallback: textarea + execCommand
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return {ok:true, via:'fallback'};
    }catch(e){
      // en dernier recours, stocker dans internalClipboard
      internalClipboard = text;
      return {ok:false, via:'internal'};
    }
  }

  async function readClipboard(){
    if (navigator.clipboard && navigator.clipboard.readText){
      try{
        const t = await navigator.clipboard.readText();
        return {ok:true, text:t, via:'system'};
      }catch(e){
        return {ok:false, error:e};
      }
    }
    // si pas possible, utiliser internalClipboard
    if (internalClipboard !== null){
      return {ok:true, text:internalClipboard, via:'internal'};
    }
    return {ok:false, error:new Error('Lecture du presse-papiers non supportée')};
  }

  // Ouvrir / fermer menu
  document.addEventListener('click', (ev)=>{
    // fermer tous menus si clique ailleurs
    if (!ev.target.closest('.actions')){
      document.querySelectorAll('.edit-menu').forEach(m => {
        m.hidden = true;
        const btn = m.closest('.actions').querySelector('.edit-btn');
        if (btn) btn.setAttribute('aria-expanded','false');
      });
    }
  });

  // Handler: ouvrir menu et tenter d'obtenir aperçu du presse-papiers si possible
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const actions = btn.closest('.actions');
      const menu = actions.querySelector('.edit-menu');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      // Basculer
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!expanded));
      // Si on ouvre le menu, essayer de lire le presse-papiers pour prévisualiser
      if (!menu.hidden){
        const previewEl = menu.querySelector('.clipboard-preview');
        previewEl.textContent = 'Chargement du presse-papiers...';
        try{
          const res = await readClipboard();
          if (res.ok){
            // tenter parse
            try{
              const obj = JSON.parse(res.text);
              previewEl.textContent = JSON.stringify(obj, null, 2);
              menu.querySelector('.menu-item.paste').disabled = false;
            }catch(e){
              previewEl.textContent = '(Le presse-papiers ne contient pas du JSON valide)';
              menu.querySelector('.menu-item.paste').disabled = true;
            }
          }else{
            previewEl.textContent = '(Accès presse-papiers refusé ou non supporté)';
            menu.querySelector('.menu-item.paste').disabled = internalClipboard===null;
          }
        }catch(e){
          previewEl.textContent = '(Erreur lecture presse-papiers)';
        }
      }
    });
  });

  // Copier
  document.addEventListener('click', async (ev) => {
    const copyBtn = ev.target.closest('.menu-item.copy');
    if (!copyBtn) return;
    const measure = copyBtn.closest('.measure');
    if (!measure) return;
    const jsonText = measure.getAttribute('data-json') || '';
    // normalize the JSON (pretty)
    try{
      const obj = JSON.parse(jsonText);
      const pretty = JSON.stringify(obj, null, 2);
      const w = await writeClipboard(pretty);
      if (w.ok){
        // si writeClipboard a échoué mais a sauvegardé internalClipboard, il renverra ok:false via internal
        showToast('Mesure copiée dans le presse-papiers.');
        // si internalClipboard fallback utilisé, mettre la variable
        if (w.via === 'internal') internalClipboard = pretty;
      }else{
        // non-ok: internal fallback set earlier
        internalClipboard = pretty;
        showToast('Copié dans le presse-papiers interne (système non accessible).');
      }
    }catch(e){
      showToast('Le contenu de la mesure n\'est pas un JSON valide — copie annulée.');
    }
  });

  // Coller (lecture, validation, aperçu, remplacement)
  document.addEventListener('click', async (ev) => {
    const pasteBtn = ev.target.closest('.menu-item.paste');
    if (!pasteBtn) return;
    const measure = pasteBtn.closest('.measure');
    if (!measure) return;

    // Lecture
    const res = await readClipboard();
    if (!res.ok){
      if (internalClipboard !== null){
        // proposer à partir du presse-papiers interne
        try{
          const obj = JSON.parse(internalClipboard);
          // confirmation
          showConfirmPreview(obj, (ok)=>{
            if (ok){
              measure.setAttribute('data-json', JSON.stringify(obj));
              renderMeasure(measure);
              showToast('Mesure remplacée (presse-papiers interne).');
            }else{
              showToast('Collage annulé.');
            }
          });
        }catch(e){
          showToast('Aucun JSON disponible à coller.');
        }
      }else{
        showToast('Impossible de lire le presse-papiers. Autorisez l\'accès ou copiez via l\'application.');
      }
      return;
    }

    // validation
    try{
      const parsed = JSON.parse(res.text);
      // aperçu + confirmation avant écraser
      showConfirmPreview(parsed, (ok) => {
        if (ok){
          measure.setAttribute('data-json', JSON.stringify(parsed));
          renderMeasure(measure);
          showToast('Mesure remplacée.');
        } else {
          showToast('Collage annulé.');
        }
      });
    }catch(e){
      showToast('Le presse-papiers ne contient pas de JSON valide.');
    }
  });

  // Raccourcis clavier : Ctrl/Cmd+C et Ctrl/Cmd+V quand la mesure a le focus
  document.querySelectorAll('.measure').forEach(m => {
    m.addEventListener('keydown', async (ev) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? ev.metaKey : ev.ctrlKey;
      if (!mod) return;
      const key = ev.key.toLowerCase();
      if (key === 'c'){
        ev.preventDefault();
        // copie
        try{
          const obj = JSON.parse(m.getAttribute('data-json'));
          const pretty = JSON.stringify(obj, null, 2);
          const w = await writeClipboard(pretty);
          if (w.ok) showToast('Copié.');
          else { internalClipboard = pretty; showToast('Copié dans presse-papiers interne.'); }
        }catch(e){
          showToast('Contenu non JSON — copie refusée.');
        }
      } else if (key === 'v'){
        ev.preventDefault();
        // collage
        const res = await readClipboard();
        if (!res.ok){
          showToast('Impossible de lire le presse-papiers.');
          return;
        }
        try{
          const parsed = JSON.parse(res.text);
          showConfirmPreview(parsed, (ok) => {
            if (ok){
              m.setAttribute('data-json', JSON.stringify(parsed));
              renderMeasure(m);
              showToast('Mesure collée.');
            } else {
              showToast('Collage annulé.');
            }
          });
        }catch(e){
          showToast('Le presse-papiers ne contient pas de JSON valide.');
        }
      }
    });
  });

  // Close modal on Escape
  document.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Escape' && !confirmModal.hidden){
      confirmModal.hidden = true;
    }
  });

})();