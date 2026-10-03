// onboarding.js
// Primo avvio dell'app: un solo popup semplice che chiede se attivare le
// notifiche oppure no (niente più tutorial a schermate). Si mostra una
// volta sola grazie a localStorage.

(function(){
  const SEEN_KEY = 'corb-onboarding-seen';
  if (localStorage.getItem(SEEN_KEY)) return; // già visto, non lo rimostriamo

  function close(){
    localStorage.setItem(SEEN_KEY, '1');
    window.__corbOnboardingOpen = false;
    document.getElementById('corb-onb-overlay')?.remove();
  }

  function attivaNotifiche(){
    import('./notify.js').then(({ enableNotifications }) => {
      enableNotifications().then(() => {
        localStorage.setItem('corb-notif-enabled', 'yes');
      }).catch(() => {}); // negato/non supportato: nessun problema, resta attivabile dopo da Impostazioni
    }).catch(() => {});
    close();
  }

  function show(){
    window.__corbOnboardingOpen = true; // segnala ad altri script (es. install-prompt) di aspettare

    const overlay = document.createElement('div');
    overlay.id = 'corb-onb-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:20px;padding:24px 20px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4);animation:corb-onb-pop .2s ease-out;text-align:center';
    card.innerHTML = `
      <div style="font-size:48px;line-height:1">🔔</div>
      <div style="font-weight:800;font-size:19px;margin-top:12px;color:#2b1d22">Vuoi ricevere le notifiche?</div>
      <div style="font-size:14px;color:#7a5d66;margin-top:8px;line-height:1.5">Promemoria partita, diretta, gol e cartellini in tempo reale.</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">
        <button id="corb-onb-yes" style="padding:13px;border-radius:12px;border:0;background:#6b0f1a;color:#fff;font-weight:800;cursor:pointer;font-size:15px">🔔 Attiva notifiche</button>
        <button id="corb-onb-no" style="padding:12px;border-radius:12px;border:1px solid #e4cbd3;background:#fff;color:#6b0f1a;font-weight:700;cursor:pointer">No, grazie</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (!document.getElementById('corb-onb-style')){
      const st = document.createElement('style');
      st.id = 'corb-onb-style';
      st.textContent = '@keyframes corb-onb-pop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}';
      document.head.appendChild(st);
    }

    document.getElementById('corb-onb-yes').onclick = attivaNotifiche;
    document.getElementById('corb-onb-no').onclick = close;
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
