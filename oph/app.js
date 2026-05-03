(function () {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?/\\|{}[]<>";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });

    document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));
  } else {
    document.querySelectorAll(".reveal").forEach((item) => item.classList.add("visible"));
  }

  document.querySelectorAll(".decode, [data-decode]").forEach((element) => {
    const finalText = element.textContent || "";
    const delay = Number(element.getAttribute("data-delay") || 0);
    if (!finalText.trim()) return;

    element.setAttribute("aria-label", finalText);

    if (reduceMotion) {
      element.textContent = finalText;
      return;
    }

    window.setTimeout(() => {
      let frame = 0;
      const letters = Array.from(finalText);
      const totalFrames = Math.max(24, Math.ceil(letters.length * 1.8));

      const interval = window.setInterval(() => {
        const progress = frame / totalFrames;
        const revealCount = Math.floor(progress * letters.length);

        element.textContent = letters
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < revealCount) return char;
            if (progress > 0.72 && Math.random() < progress - 0.66) return char;
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("");

        frame += 1;

        if (frame > totalFrames) {
          window.clearInterval(interval);
          element.textContent = finalText;
        }
      }, 24);
    }, delay);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    if (typeof window.gtag !== "function") return;

    const url = new URL(link.href, window.location.href);
    const isTracked =
      link.dataset.trackLink ||
      url.origin !== window.location.origin ||
      url.pathname.startsWith("/oph/");

    if (!isTracked) return;

    window.gtag("event", "navigation_click", {
      link_label: link.dataset.trackLink || "",
      link_text: (link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      link_url: url.toString(),
      page_section: document.body.classList.contains("landing-page") ? "oph_landing_page" : "oph_hub"
    });
  });
})();
