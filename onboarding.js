// onboarding.js
// Piccolo tutorial a schermate, mostrato solo la PRIMA volta che qualcuno apre
// l'app (poi si ricorda da solo grazie a localStorage). Si può anche saltare.

(function(){
  const SEEN_KEY = 'corb-onboarding-seen';
  if (localStorage.getItem(SEEN_KEY)) return; // già visto, non lo rimostriamo

  const SLIDES = [
    {
      emoji: '⚽',
      title: "Benvenuto nell'app del Corbiolo!",
      text: 'Un giro veloce di 20 secondi per farti vedere cosa puoi fare qui dentro.'
    },
    {
      emoji: '📅',
      title: 'Prossima partita',
      text: 'Countdown, dove si gioca e un tasto per aggiungerla al tuo calendario del telefono in un tocco.'
    },
    {
      emoji: '🔴',
      title: 'Diretta e notifiche',
      text: 'Quando giochiamo, segui il punteggio in tempo reale in Home. Attiva le notifiche in Impostazioni per non perderti gol e inizio partita.'
    },
    {
      emoji: '🏆',
      title: 'Risultati, Calendario, Classifica',
      text: 'Tutto il girone, giornata per giornata, con classifica e marcatori sempre aggiornati.'
    },
    {
      emoji: '👉',
      title: 'Tutto qui',
      text: 'Trovi tutto nel menu (☰ in alto). Buona partita!'
    }
  ];

  let idx = 0;

  function markSeen(){
    localStorage.setItem(SEEN_KEY, '1');
    window.__corbOnboardingOpen = false;
    document.getElementById('corb-onb-overlay')?.remove();
  }

  function render(){
    const s = SLIDES[idx];
    const dots = SLIDES.map((_, i) => `<span style="width:${i===idx?18:7}px;height:7px;border-radius:999px;background:${i===idx?'#6b0f1a':'#e0d5d8'};transition:all .2s;display:inline-block"></span>`).join('');
    const isLast = idx === SLIDES.length - 1;

    document.getElementById('corb-onb-card').innerHTML = `
      <div style="text-align:right">
        <button id="corb-onb-skip" style="border:0;background:transparent;color:#9c8a90;font-size:13px;cursor:pointer;font-weight:600">Salta ✕</button>
      </div>
      <div style="text-align:center;padding:10px 10px 0">
        <div style="font-size:52px;line-height:1">${s.emoji}</div>
        <div style="font-weight:800;font-size:19px;margin-top:14px;color:#2b1d22">${s.title}</div>
        <div style="font-size:14px;color:#7a5d66;margin-top:10px;line-height:1.5">${s.text}</div>
      </div>
      <div style="display:flex;justify-content:center;gap:6px;margin:22px 0 16px">${dots}</div>
      <div style="display:flex;gap:10px;padding:0 4px">
        ${idx>0 ? `<button id="corb-onb-back" style="flex:1;padding:12px;border-radius:12px;border:1px solid #e4cbd3;background:#fff;color:#6b0f1a;font-weight:700;cursor:pointer">Indietro</button>` : ''}
        <button id="corb-onb-next" style="flex:2;padding:12px;border-radius:12px;border:0;background:#6b0f1a;color:#fff;font-weight:800;cursor:pointer">${isLast ? 'Inizia! 🎉' : 'Avanti →'}</button>
      </div>
    `;

    document.getElementById('corb-onb-skip').onclick = markSeen;
    document.getElementById('corb-onb-next').onclick = () => {
      if (isLast){ markSeen(); return; }
      idx++; render();
    };
    const backBtn = document.getElementById('corb-onb-back');
    if (backBtn) backBtn.onclick = () => { idx--; render(); };
  }

  function show(){
    window.__corbOnboardingOpen = true; // segnala ad altri script (es. install-prompt) di aspettare

    const overlay = document.createElement('div');
    overlay.id = 'corb-onb-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px';
    const card = document.createElement('div');
    card.id = 'corb-onb-card';
    card.style.cssText = 'background:#fff;border-radius:20px;padding:20px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4);animation:corb-onb-pop .2s ease-out';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (!document.getElementById('corb-onb-style')){
      const st = document.createElement('style');
      st.id = 'corb-onb-style';
      st.textContent = '@keyframes corb-onb-pop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}';
      document.head.appendChild(st);
    }
    render();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
