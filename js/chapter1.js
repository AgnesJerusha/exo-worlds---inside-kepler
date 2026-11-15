/**
 * Chapter 1 Controller — EXO WORLDS
 *
 * Modes:
 *  AUDIO ON:  captions driven by narrator.js rAF engine (no typing here)
 *  AUDIO OFF: local timed typing at ~38 ms/char with break-tag pauses between phrases
 *
 * Sections & slides:
 *  1 – THE MYSTERY OF THE UNIVERSE        | s01–s03
 *  2 – THE SCIENTIFIC CHALLENGE           | s04–s05
 *  3 – THE BIRTH OF KEPLER               | s06–s07
 *  4 – THE LAUNCH AND JOURNEY INTO SPACE  | s08–s10
 */

import { setVisualSlide, startVisualLoop } from './visuals.js';
import {
  setActiveAudioSlide,
  isAudioEnabled,
  getAudioDuration,
  setAudioEndedCallback
} from './narrator.js';

// ─── State ────────────────────────────────────────────────────────────────────
let chapterData        = null;
let currentSlideIndex  = 0;
let currentSectionNumber = -1;
let currentSlide       = null;
let isTitleCardActive  = false;
let isCCEnabled        = sessionStorage.getItem('exo_cc_enabled') !== 'false';

// Timed-typing state (audio OFF path)
let isTyping           = false;
let isFactTyping       = false;
let typeTimeouts       = [];
let factTimeout        = null;

// Callbacks
let onTypingCompleteCallback = null;
let onSlideChangeCallback    = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initChapter1(callbacks = {}) {
  onTypingCompleteCallback = callbacks.onTypingComplete || null;
  onSlideChangeCallback    = callbacks.onSlideChange    || null;

  try {
    const res = await fetch('./data/chapter1.json');
    chapterData = await res.json();
  } catch (err) {
    console.error('Failed to load data/chapter1.json', err);
  }

  // Tell narrator to fire onTypingCompleteCallback when audio ends
  setAudioEndedCallback(() => {
    // Only signal "done" if the fact is also done (or absent)
    if (!isFactTyping) _checkAllDone();
  });

  _initCCButton();
}

// ─── Public queries ───────────────────────────────────────────────────────────
export function getChapterData()     { return chapterData; }
export function getTotalSlides()     { return chapterData ? chapterData.slides.length : 10; }
export function getCurrentSlideIndex() { return currentSlideIndex; }

/** True while any animation (title card, typing, fact typing) is in progress */
export function isTypingActive() {
  return isTitleCardActive || isTyping || isFactTyping;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
export function startChapter1Cinematic(onReady) {
  currentSlideIndex    = 0;
  currentSectionNumber = -1;
  startVisualLoop();
  _loadSlide(0, true, onReady);
}

export function goToChapterSlide(index) {
  if (!chapterData || index < 0 || index >= chapterData.slides.length) return;

  const nextSlide      = chapterData.slides[index];
  const sectionChanged = currentSectionNumber !== nextSlide.section;
  currentSlideIndex    = index;

  if (sectionChanged) {
    _playSectionTitleCard(nextSlide, () => _loadSlide(index, false));
  } else {
    _loadSlide(index, false);
  }
}

// ─── Instant completion (Space / Enter / click) ───────────────────────────────
export function completeTypingInstantly() {
  if (isTitleCardActive) {
    const overlay = document.getElementById('chTitleCardOverlay');
    if (overlay) { overlay.classList.remove('revealed', 'active'); }
    isTitleCardActive = false;
  }

  if (!currentSlide) return;

  _clearAllTyping();

  const subEl = document.getElementById('subtitleText');
  if (subEl) subEl.textContent = currentSlide.text || '';

  const factEl = document.getElementById('factText');
  if (factEl && currentSlide.fact) {
    factEl.textContent = currentSlide.fact;
    factEl.style.opacity = '1';
  }

  isTyping     = false;
  isFactTyping = false;
  _checkAllDone();
}

// ─── CC toggle ────────────────────────────────────────────────────────────────
function _initCCButton() {
  const ccBtn     = document.getElementById('ccBtn');
  const bottomCard = document.getElementById('bottomCard');

  function update() {
    if (ccBtn) {
      ccBtn.setAttribute('aria-pressed', isCCEnabled ? 'true' : 'false');
      ccBtn.textContent = isCCEnabled ? 'CC [ON]' : 'CC [OFF]';
    }
    if (bottomCard) bottomCard.classList.toggle('cc-hidden', !isCCEnabled);
    sessionStorage.setItem('exo_cc_enabled', isCCEnabled ? 'true' : 'false');
  }

  update();
  if (ccBtn) ccBtn.addEventListener('click', () => { isCCEnabled = !isCCEnabled; update(); });
}

// ─── Title-card sequence ──────────────────────────────────────────────────────
function _playSectionTitleCard(slide, onComplete) {
  isTitleCardActive    = true;
  currentSectionNumber = slide.section;

  const overlay = document.getElementById('chTitleCardOverlay');
  const titleEl = document.getElementById('chTitleCardTitle');
  const subEl   = document.getElementById('chTitleCardSub');
  const flash   = document.getElementById('sectionFlash');

  if (flash) { flash.classList.remove('flash'); void flash.offsetWidth; flash.classList.add('flash'); }
  if (titleEl) titleEl.textContent = slide.title;
  if (subEl)   subEl.textContent   = slide.sectionSubtitle;

  if (overlay) {
    overlay.classList.add('active');
    setTimeout(() => overlay.classList.add('revealed'), 50);
  }

  setTimeout(() => {
    _updatePersistentHeader(slide.title, slide.sectionSubtitle);
    if (overlay) {
      overlay.classList.remove('revealed');
      setTimeout(() => {
        overlay.classList.remove('active');
        isTitleCardActive = false;
        if (onComplete) onComplete();
      }, 500);
    } else {
      isTitleCardActive = false;
      if (onComplete) onComplete();
    }
  }, 2200);
}

function _updatePersistentHeader(title, subtitle) {
  const t = document.getElementById('chSectionTitle');
  const s = document.getElementById('chSectionSubtitle');
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
}

// ─── Slide loading ────────────────────────────────────────────────────────────
function _loadSlide(index, isFirstSlide, onReady = null) {
  currentSlide = chapterData.slides[index];
  if (!currentSlide) return;

  if (isFirstSlide) {
    _playSectionTitleCard(currentSlide, () => {
      _loadSlideContent(index);
      if (onReady) onReady();
    });
  } else {
    _loadSlideContent(index);
  }
}

function _loadSlideContent(index) {
  // 1. Visuals
  setVisualSlide(currentSlide.id);

  // 2. Clear previous typing state
  _clearAllTyping();
  isTyping     = false;
  isFactTyping = false;

  // 3. Persistent header
  _updatePersistentHeader(currentSlide.title, currentSlide.sectionSubtitle);

  // 4. Clear caption area
  const subEl  = document.getElementById('subtitleText');
  const factEl = document.getElementById('factText');
  if (subEl)  subEl.textContent  = '';
  if (factEl) factEl.textContent = '';

  // 5. Hand off to narrator (triggers audio + rAF captions when ON)
  //    Pass the full slide object so narrator has phrases / breakMs / audio
  setActiveAudioSlide(currentSlide.id, currentSlide);

  // 6. When audio is OFF: run local timed typing engine
  if (!isAudioEnabled()) {
    _typePhrasesOffline(currentSlide);
  }
  // When audio is ON: narrator.js drives captions via rAF;
  //   onAudioEndedCb fires _checkAllDone when done.

  // 7. Fact text — always timed (independent of audio)
  if (currentSlide.fact && currentSlide.fact.trim() !== '') {
    const delay = isAudioEnabled() ? 1200 : 1000;
    factTimeout = setTimeout(() => _typeFact(currentSlide.fact), delay);
  }

  if (onSlideChangeCallback) onSlideChangeCallback(index, currentSlide);
}

// ─── Offline timed typing (audio OFF) ────────────────────────────────────────
/**
 * Types phrases one after another.
 * Between phrases we wait for the break duration from breakMs[i].
 * Characters are appended (previous phrases stay on screen).
 */
function _typePhrasesOffline(slide) {
  const subEl   = document.getElementById('subtitleText');
  if (!subEl) return;

  const phrases = slide.phrases || [slide.text];
  const breakMs = slide.breakMs || [];
  const CHAR_MS = 36;   // ms per character

  isTyping = true;
  let accumulated = '';

  function typePhrase(phraseIdx) {
    if (!isTyping) return;
    if (phraseIdx >= phrases.length) {
      isTyping = false;
      _checkAllDone();
      return;
    }

    const phrase = phrases[phraseIdx];
    const prefix = accumulated; // text already on screen
    let charIdx = 0;

    function nextChar() {
      if (!isTyping) return;
      if (charIdx < phrase.length) {
        subEl.textContent = prefix + (phraseIdx > 0 ? ' ' : '') + phrase.slice(0, charIdx + 1);
        charIdx++;

        // Slight pause after sentence-ending punctuation
        const ch    = phrase[charIdx - 1];
        const extra = /[.!?]/.test(ch) ? 180 : /[,;:]/.test(ch) ? 100 : 0;
        const t = setTimeout(nextChar, CHAR_MS + extra);
        typeTimeouts.push(t);
      } else {
        // Phrase done — accumulate text, then wait for the break
        accumulated = prefix + (phraseIdx > 0 ? ' ' : '') + phrase;
        const gap = breakMs[phraseIdx] || 0;
        const t = setTimeout(() => typePhrase(phraseIdx + 1), Math.max(80, gap));
        typeTimeouts.push(t);
      }
    }

    nextChar();
  }

  typePhrase(0);
}

// ─── Fact typing (always timed) ───────────────────────────────────────────────
function _typeFact(text) {
  const factEl = document.getElementById('factText');
  if (!factEl) return;

  isFactTyping = true;
  factEl.textContent = '';
  factEl.style.opacity = '1';

  let i = 0;
  function step() {
    if (!isFactTyping) return;
    if (i < text.length) {
      factEl.textContent = text.slice(0, i + 1);
      i++;
      const t = setTimeout(step, 48);
      typeTimeouts.push(t);
    } else {
      isFactTyping = false;
      _checkAllDone();
    }
  }
  step();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _clearAllTyping() {
  typeTimeouts.forEach(t => clearTimeout(t));
  typeTimeouts = [];
  if (factTimeout) { clearTimeout(factTimeout); factTimeout = null; }
}

function _checkAllDone() {
  // When audio is ON: done when audio ended AND fact typing is done
  // When audio is OFF: done when both isTyping and isFactTyping are false
  if (!isTyping && !isFactTyping) {
    if (onTypingCompleteCallback) onTypingCompleteCallback(currentSlideIndex);
  }
}
