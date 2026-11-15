/**
 * Reusable Side Star Topic Menu — EXO WORLDS
 * Fixed to the right edge, vertically centred, glowing star button with hover TOPICS label.
 * Opens a slim glass panel of numbered topic items: { label, slideId }.
 * Keyboard accessible, closes on outside click, Esc, or selection.
 * Hidden automatically when not in chapter or during title cards.
 */

export function createTopicMenu(options = {}) {
  const items = Array.isArray(options.items) ? options.items : [];
  const onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
  const mountTarget = options.container || document.body;

  let isVisible = false;
  let isTitleCardHidden = false;
  let isOpen = false;
  let activeSlideId = null;

  // Root wrapper
  const root = document.createElement('div');
  root.className = 'topic-menu-root';
  root.setAttribute('aria-hidden', 'true');

  // Star / Orb Trigger Button
  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'topic-star-btn';
  triggerBtn.setAttribute('aria-expanded', 'false');
  triggerBtn.setAttribute('aria-haspopup', 'true');
  triggerBtn.setAttribute('aria-label', 'Chapter topics menu');

  triggerBtn.innerHTML = `
    <span class="topic-star-label" aria-hidden="true">TOPICS</span>
    <span class="topic-star-orb" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="22" height="22">
        <path d="M16 2 L19.2 12.8 L30 16 L19.2 19.2 L16 30 L12.8 19.2 L2 16 L12.8 12.8 Z" fill="currentColor"/>
      </svg>
    </span>
  `;

  // Slim Glass Panel
  const panel = document.createElement('nav');
  panel.className = 'topic-menu-panel glass';
  panel.setAttribute('aria-label', 'Chapter sections');
  panel.setAttribute('aria-hidden', 'true');

  const panelHeader = document.createElement('div');
  panelHeader.className = 'topic-menu-header';
  panelHeader.textContent = 'SECTIONS';
  panel.appendChild(panelHeader);

  const list = document.createElement('div');
  list.className = 'topic-menu-list';
  panel.appendChild(list);

  const itemButtons = [];

  items.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topic-menu-item';
    btn.dataset.slideId = item.slideId;
    btn.tabIndex = -1;

    const numSpan = document.createElement('span');
    numSpan.className = 'topic-menu-num';
    numSpan.textContent = String(idx + 1);

    const textSpan = document.createElement('span');
    textSpan.className = 'topic-menu-text';
    textSpan.textContent = item.label;

    btn.appendChild(numSpan);
    btn.appendChild(textSpan);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      onSelect(item.slideId);
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = itemButtons[(idx + 1) % itemButtons.length];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = itemButtons[(idx - 1 + itemButtons.length) % itemButtons.length];
        if (prev) prev.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        triggerBtn.focus();
      }
    });

    list.appendChild(btn);
    itemButtons.push(btn);
  });

  root.appendChild(panel);
  root.appendChild(triggerBtn);
  mountTarget.appendChild(root);

  function syncVisibility() {
    const shouldShow = isVisible && !isTitleCardHidden;
    root.classList.toggle('visible', shouldShow);
    root.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    if (!shouldShow && isOpen) {
      close();
    }
  }

  function open() {
    if (!isVisible || isTitleCardHidden) return;
    isOpen = true;
    root.classList.add('open');
    triggerBtn.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    itemButtons.forEach((btn) => { btn.tabIndex = 0; });
    const activeBtn = itemButtons.find((b) => b.classList.contains('active')) || itemButtons[0];
    if (activeBtn) {
      requestAnimationFrame(() => activeBtn.focus());
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('open');
    triggerBtn.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    itemButtons.forEach((btn) => { btn.tabIndex = -1; });
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  // Outside click closes menu
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !root.contains(e.target)) {
      close();
    }
  });

  // Esc closes menu (capture phase so global slide navigation doesn't react)
  window.addEventListener('keydown', (e) => {
    if (isOpen && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      triggerBtn.focus();
    }
  }, true);

  function setActive(slideId, activeIndex = -1) {
    activeSlideId = slideId;
    itemButtons.forEach((btn, idx) => {
      const match = activeIndex >= 0 ? idx === activeIndex : btn.dataset.slideId === slideId;
      btn.classList.toggle('active', match);
      if (match) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function show() {
    isVisible = true;
    syncVisibility();
  }

  function hide() {
    isVisible = false;
    close();
    syncVisibility();
  }

  function setTitleCardHidden(hidden) {
    isTitleCardHidden = Boolean(hidden);
    syncVisibility();
  }

  function destroy() {
    root.remove();
  }

  return {
    show,
    hide,
    open,
    close,
    toggle,
    setActive,
    setTitleCardHidden,
    isOpen: () => isOpen,
    destroy
  };
}
