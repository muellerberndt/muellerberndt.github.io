// X (Twitter) pixel for ad measurement. Loads only with the visitor's consent rule:
// outside Europe it loads unless the visitor declined; in Europe only after "accept".
(() => {
  const me = document.currentScript;
  const id = me && me.dataset.id;
  if (!id) return;
  let saved = null;
  try { saved = localStorage.getItem("fp_consent"); } catch (e) {}
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  const european = /^Europe\//.test(tz) || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz);
  let loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
    },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
    a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
    twq('config', id);
  }
  if (saved === "granted" || (!saved && !european)) load();
  addEventListener("fp-consent", (e) => { if (e.detail === "granted") load(); });
})();
