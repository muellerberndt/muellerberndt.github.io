/* The demo pages: a frame marked data-demo-autosize takes the height its runtime reports. */
(() => {
  'use strict';
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || event.data.type !== 'demo-height') return;
    const frame = document.querySelector(`iframe.demo-embed[data-demo-autosize="${CSS.escape(String(event.data.demo))}"]`);
    const height = Number(event.data.height);
    if (!frame || !(height > 0)) return;
    // The reported height is the runtime's content; the frame's own border sits outside it.
    frame.style.boxSizing = 'content-box';
    frame.style.height = `${Math.ceil(height)}px`;
    frame.style.maxHeight = 'none';
  });
})();
