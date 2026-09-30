/* The full library is readable without JavaScript; filtering is progressive. */
(() => {
  const controls = document.querySelector('[data-library-controls]');
  if (!controls) return;
  const papers = [...document.querySelectorAll('[data-paper]')];
  const filters = [...controls.querySelectorAll('[data-filter]')];
  const search = document.getElementById('paper-search');
  const status = document.querySelector('[data-paper-count]');
  const empty = document.querySelector('[data-paper-empty]');
  let category = 'all';
  function update() {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    papers.forEach(paper => {
      const matches = (category === 'all' || paper.dataset.category === category)
        && terms.every(term => paper.textContent.toLocaleLowerCase().includes(term));
      paper.hidden = !matches;
      if (matches) count++;
    });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
    status.textContent = `${count} ${count === 1 ? 'paper' : 'papers'}`;
    empty.hidden = count !== 0;
  }
  filters.forEach(button => button.addEventListener('click', () => { category = button.dataset.filter; update(); }));
  search.addEventListener('input', update);
  controls.hidden = false;
  update();
})();
