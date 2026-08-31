// install-prompt.js — banner automatico "Installa l'app"
// - Android/Chrome/Edge: mostra il popup NATIVO del browser (evento beforeinstallprompt)
// - iPhone/Safari: Apple non permette nessun popup automatico nativo,
//   quindi mostriamo un banner nostro con le 2 istruzioni per farlo a mano.
// - Se l'app è già installata (aperta come "app" a schermo intero), non mostra nulla.

(function(){
  const DISMISS_KEY = 'corb_install_dismissed_at';
  const DISMISS_DAYS = 14;

  function alreadyInstalled(){
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true; // iOS
  }

  function recentlyDismissed(){
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const days = (Date.now() - new Date(raw).getTime()) / 86400000;
    return days < DISMISS_DAYS;
  }

  function markDismissed(){
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
  }

  function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function injectStyle(){
    if (document.getElementById('corb-install-style')) return;
    const style = document.createElement('style');
    style.id = 'corb-install-style';
    style.textContent = `
      .corb-install-banner{
        position:fixed; left:12px; right:12px; bottom:12px; z-index:3000;
        background:var(--card,#fff); color:var(--text,#2b1d22);
        border:1px solid var(--ring,rgba(0,0,0,.08));
        border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.18);
        padding:14px 14px 12px; display:flex; gap:12px; align-items:flex-start;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial;
        animation: corb-slide-up .25s ease-out;
      }
      @keyframes corb-slide-up{ from{ transform:translateY(16px); opacity:0 } to{ transform:translateY(0); opacity:1 } }
      .corb-install-banner img{ width:40px; height:40px; border-radius:10px; flex-shrink:0 }
      .corb-install-text{ flex:1; font-size:14px; line-height:1.4 }
      .corb-install-text b{ display:block; margin-bottom:2px; font-size:15px }
      .corb-install-actions{ display:flex; gap:8px; margin-top:10px }
      .corb-install-btn{
        border:0; border-radius:999px; padding:8px 14px; font-weight:700; font-size:13px;
        cursor:pointer; background:var(--granata,#6b0f1a); color:#fff;
      }
      .corb-install-btn.secondary{ background:transparent; color:var(--muted,#7a5d66); padding:8px 8px }
      .corb-install-close{
        background:transparent; border:0; font-size:18px; color:var(--muted,#7a5d66);
        cursor:pointer; line-height:1; padding:2px 4px;
      }
    `;
    document.head.appendChild(style);
  }

  function buildBanner({html, onPrimary, primaryLabel}){
    injectStyle();
    const el = document.createElement('div');
    el.className = 'corb-install-banner';
    el.innerHTML = `
      <img src="./img/logo_c5.png" alt="">
      <div class="corb-install-text">
        ${html}
        <div class="corb-install-actions">
          ${primaryLabel ? `<button class="corb-install-btn" id="corb-install-primary">${primaryLabel}</button>` : ''}
          <button class="corb-install-btn secondary" id="corb-install-later">Non ora</button>
        </div>
      </div>
      <button class="corb-install-close" id="corb-install-x" aria-label="Chiudi">×</button>
    `;
    document.body.appendChild(el);

    document.getElementById('corb-install-x').onclick = () => { markDismissed(); el.remove(); };
    document.getElementById('corb-install-later').onclick = () => { markDismissed(); el.remove(); };
    if (onPrimary){
      document.getElementById('corb-install-primary').onclick = () => { onPrimary(); el.remove(); };
    }
    return el;
  }

  function showIOSInstructions(){
    buildBanner({
      html: `<b>Installa l'app CORB</b>
             Tocca l'icona <b>Condividi</b> (il quadrato con la freccia ↑ in basso su Safari)
             poi scegli <b>"Aggiungi a Home"</b>. Ti servirà per ricevere le notifiche partita.
             <div style="margin-top:6px"><a href="./scarica.html#iphone" style="font-size:12px;color:var(--granata,#6b0f1a);font-weight:700">per iPhone, guida passo passo →</a></div>`
    });
  }

  function showAndroidPrompt(deferredEvent){
    buildBanner({
      html: `<b>Installa l'app CORB</b> Un tocco e l'hai sempre a portata di mano, con le notifiche partita.`,
      primaryLabel: 'Installa',
      onPrimary: async () => {
        deferredEvent.prompt();
        try { await deferredEvent.userChoice; } catch {}
      }
    });
  }

  // --- Icona fissa in alto, sempre disponibile ---
  // A differenza del banner (che dopo un "Non ora" sparisce per 14 giorni),
  // questa icona resta sempre lì per chi cambia idea e vuole installare dopo.
  let deferredPromptGlobal = null;
  function injectHeaderIcon(){
    if (alreadyInstalled()) return;
    const right = document.querySelector('.topbar .right');
    if (!right || document.getElementById('corb-header-install')) return;

    const btn = document.createElement('button');
    btn.id = 'corb-header-install';
    btn.className = 'iconbtn';
    btn.setAttribute('aria-label', 'Scarica app');
    btn.title = 'Scarica app';
    btn.style.fontSize = '20px';
    btn.style.marginRight = '2px';
    btn.textContent = '📲';
    right.insertBefore(btn, right.firstChild);

    btn.addEventListener('click', async () => {
      if (deferredPromptGlobal){
        deferredPromptGlobal.prompt();
        try { await deferredPromptGlobal.userChoice; } catch {}
      } else if (isIOS()){
        window.location.href = './scarica.html#iphone';
      } else {
        window.location.href = './scarica.html';
      }
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', injectHeaderIcon);
  } else {
    injectHeaderIcon();
  }

  if (alreadyInstalled() || recentlyDismissed()) return;

  // Se il tutorial iniziale è aperto, aspetta che si chiuda prima di mostrare
  // il banner di installazione, per non sovrapporre due popup insieme.
  function waitForOnboarding(fn, delay){
    function tryShow(){
      if (window.__corbOnboardingOpen) { setTimeout(tryShow, 500); return; }
      setTimeout(fn, delay);
    }
    tryShow();
  }

  // --- Android / Chrome / Edge: popup nativo reale ---
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    deferredPromptGlobal = e;
    waitForOnboarding(() => showAndroidPrompt(deferredPrompt), 1200);
  });

  // --- iPhone/iPad: nessun evento nativo possibile, mostriamo istruzioni ---
  if (isIOS() && !alreadyInstalled()){
    waitForOnboarding(showIOSInstructions, 1500);
  }
})();
