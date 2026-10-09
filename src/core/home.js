// The launcher view: a 3D hero title and one tilt card per module.

export function renderHome(view, { modules, fx, navigate, openModulesFolder, iconMarkup }) {
  const cleanups = [];
  view.classList.add('home');
  view.innerHTML = `
    <div class="home-hero">
      <div class="eyebrow"><span class="pulse-dot"></span>MODULAR WORKSPACE</div>
      <h1 class="hero-title" aria-label="PRISM">
        ${Array.from({ length: 10 }, (_, i) => `<span class="hero-layer" style="--z:${i}">PRISM</span>`).join('')}
      </h1>
      <p class="hero-sub">${openModulesFolder ? 'Every page is a plug-in module. Pick one below — or drop your own into the modules folder.' : 'Every page is a module. Pick one below to start.'}</p>
    </div>
    <div class="module-grid"></div>
  `;

  const hero = view.querySelector('.hero-title');
  const onMove = (e) => {
    const x = e.clientX / innerWidth - 0.5;
    const y = e.clientY / innerHeight - 0.5;
    hero.style.transform = `rotateX(${y * -26}deg) rotateY(${x * 34}deg)`;
  };
  addEventListener('pointermove', onMove);
  cleanups.push(() => removeEventListener('pointermove', onMove));

  const top = hero.lastElementChild;
  fx.scramble(top, 'PRISM', { duration: 1100 });

  const grid = view.querySelector('.module-grid');
  const cards = [];

  modules.forEach((meta, i) => {
    const card = document.createElement('button');
    card.className = 'mcard';
    card.style.setProperty('--card-accent', meta.accent || '#7c5cff');
    card.style.setProperty('--i', i);
    card.innerHTML = `
      <span class="mcard-glare"></span>
      <span class="mcard-icon">${iconMarkup(meta)}</span>
      <span class="mcard-body">
        <span class="mcard-title"></span>
        <span class="mcard-desc"></span>
      </span>
      <span class="mcard-foot">
        <span class="mcard-tag"></span>
        <span class="mcard-go">Launch <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
      </span>`;
    card.querySelector('.mcard-title').textContent = meta.name;
    card.querySelector('.mcard-desc').textContent = meta.description || '';
    card.querySelector('.mcard-tag').textContent = meta.source === 'user' ? 'user module' : 'built-in';
    card.addEventListener('click', (e) => {
      fx.burst(e.clientX, e.clientY, { color: meta.accent, count: 40 });
      navigate(meta.id);
    });
    cards.push(card);
  });

  // Platforms without a modules folder (the Android app) have no "add" card.
  if (openModulesFolder) cards.push(addCard(modules.length, openModulesFolder));

  for (const card of cards) {
    grid.appendChild(card);
    cleanups.push(fx.tilt(card, { max: 9, scale: 1.03 }));
  }

  return () => cleanups.forEach((fn) => fn());
}

function addCard(i, openModulesFolder) {
  const add = document.createElement('button');
  add.className = 'mcard mcard-add';
  add.style.setProperty('--i', i);
  add.innerHTML = `
    <span class="mcard-glare"></span>
    <span class="mcard-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span>
    <span class="mcard-body">
      <span class="mcard-title">Add a module</span>
      <span class="mcard-desc">Open the modules folder. Each sub-folder with a module.json becomes a new page — hit reload in the dock to pick it up.</span>
    </span>
    <span class="mcard-foot"><span class="mcard-tag">extend</span><span class="mcard-go">Open folder</span></span>`;
  add.addEventListener('click', openModulesFolder);
  return add;
}
