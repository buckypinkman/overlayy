import * as pdfjsLib from '../node_modules/pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

const api = window.overlay;
const $ = (id) => document.getElementById(id);

const viewer = $('viewer');
const content = $('content');
const empty = $('empty');
const pdfNav = $('pdf-nav');
const pageInfo = $('page-info');
const titleEl = $('title');
const fitBtn = $('btn-fit');
const opacityInput = $('opacity');
const opacityVal = $('opacity-val');

const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

const PADDING = 24;       // matches #content padding * 2
const ZOOM_STEP = 1.2;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;

// doc: null | { kind: 'pdf', pdf, pages: [{ page, canvas, task, rendered }] }
//           | { kind: 'image', url, img }
let doc = null;
let zoom = 1;             // 1 = fit to width
let layoutToken = 0;
let observer = null;

/* ---------- loading ---------- */

async function loadFile(name, bytes) {
  const ext = name.split('.').pop().toLowerCase();
  try {
    if (ext === 'pdf') {
      const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
      closeDoc();
      doc = { kind: 'pdf', pdf, pages: [] };
    } else if (IMAGE_TYPES[ext]) {
      const url = URL.createObjectURL(new Blob([bytes], { type: IMAGE_TYPES[ext] }));
      const img = new Image();
      img.src = url;
      await img.decode();
      closeDoc();
      doc = { kind: 'image', url, img };
    } else {
      alert(`Unsupported file type: .${ext}`);
      return;
    }
  } catch (err) {
    alert(`Could not open ${name}:\n${err.message || err}`);
    return;
  }

  zoom = 1;
  titleEl.textContent = name;
  empty.hidden = true;
  pdfNav.hidden = doc.kind !== 'pdf';
  viewer.scrollTo(0, 0);
  await layout();
}

function closeDoc() {
  layoutToken++;
  if (observer) observer.disconnect();
  if (doc?.kind === 'pdf') {
    doc.pages.forEach((p) => p.task?.cancel());
    doc.pdf.destroy();
  } else if (doc?.kind === 'image') {
    URL.revokeObjectURL(doc.url);
  }
  doc = null;
  content.replaceChildren();
}

async function openViaDialog() {
  const file = await api.openFile();
  if (file) await loadFile(file.name, file.data);
}

/* ---------- layout & rendering ---------- */

function availableWidth() {
  return Math.max(50, viewer.clientWidth - PADDING);
}

async function layout() {
  fitBtn.textContent = `${Math.round(zoom * 100)}%`;
  if (!doc) return;
  if (doc.kind === 'image') return layoutImage();
  return layoutPdf();
}

function layoutImage() {
  const { img } = doc;
  img.style.width = `${Math.round(availableWidth() * zoom)}px`;
  if (!img.isConnected) content.replaceChildren(img);
}

async function layoutPdf() {
  const token = ++layoutToken;
  const { pdf } = doc;

  // Keep the reading position when re-laying out (zoom / resize).
  const scrollRatio = viewer.scrollHeight > 0 ? viewer.scrollTop / viewer.scrollHeight : 0;

  if (doc.pages.length === 0) {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      if (token !== layoutToken) return;
      doc.pages.push({ page, canvas: null, task: null });
    }
  }

  if (observer) observer.disconnect();
  observer = new IntersectionObserver(onPageVisible, { root: viewer, rootMargin: '800px 0px' });

  const width = availableWidth();
  const dpr = window.devicePixelRatio || 1;
  const canvases = doc.pages.map((p, i) => {
    p.task?.cancel();
    const base = p.page.getViewport({ scale: 1 });
    const viewport = p.page.getViewport({ scale: (width / base.width) * zoom });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.dataset.index = i;
    p.canvas = canvas;
    p.viewport = viewport;
    p.task = null;
    observer.observe(canvas);
    return canvas;
  });

  content.replaceChildren(...canvases);
  viewer.scrollTop = scrollRatio * viewer.scrollHeight;
  updatePageInfo();
}

function onPageVisible(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting || !doc || doc.kind !== 'pdf') continue;
    observer.unobserve(entry.target);
    renderPage(doc.pages[Number(entry.target.dataset.index)]);
  }
}

async function renderPage(p) {
  const { canvas, viewport } = p;
  const dpr = window.devicePixelRatio || 1;
  p.task = p.page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
  });
  try {
    await p.task.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error(err);
  }
}

/* ---------- PDF navigation ---------- */

function currentPageIndex() {
  if (!doc || doc.kind !== 'pdf' || doc.pages.length === 0) return 0;
  const mid = viewer.scrollTop + viewer.clientHeight / 3;
  let idx = 0;
  doc.pages.forEach((p, i) => {
    if (p.canvas && p.canvas.offsetTop <= mid) idx = i;
  });
  return idx;
}

function updatePageInfo() {
  if (!doc || doc.kind !== 'pdf') return;
  pageInfo.textContent = `${currentPageIndex() + 1} / ${doc.pages.length}`;
}

function goToPage(index) {
  if (!doc || doc.kind !== 'pdf') return;
  const i = Math.max(0, Math.min(doc.pages.length - 1, index));
  viewer.scrollTop = doc.pages[i].canvas.offsetTop - 12;
}

/* ---------- zoom ---------- */

function setZoom(value) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  if (next === zoom) return;
  zoom = next;
  layout();
}

/* ---------- opacity ---------- */

function showOpacity(v) {
  const pct = Math.round(v * 100);
  opacityInput.value = pct;
  opacityVal.textContent = `${pct}%`;
}

opacityInput.addEventListener('input', () => {
  const v = Number(opacityInput.value) / 100;
  opacityVal.textContent = `${opacityInput.value}%`;
  api.setOpacity(v);
});
api.onOpacityChanged(showOpacity);
api.getOpacity().then(showOpacity);

api.onClickThroughChanged((on) => {
  $('click-through-badge').hidden = !on;
});

/* ---------- resize grip ---------- */

const grip = $('grip');
let gripStart = null;
let gripPending = null;
let gripFrame = 0;

grip.addEventListener('pointerdown', (e) => {
  grip.setPointerCapture(e.pointerId);
  gripStart = { x: e.screenX, y: e.screenY };
  api.resizeStart();
});

grip.addEventListener('pointermove', (e) => {
  if (!gripStart) return;
  gripPending = { dx: e.screenX - gripStart.x, dy: e.screenY - gripStart.y };
  if (!gripFrame) {
    gripFrame = requestAnimationFrame(() => {
      gripFrame = 0;
      api.resizeMove(gripPending.dx, gripPending.dy);
    });
  }
});

function endGrip() {
  if (!gripStart) return;
  gripStart = null;
  api.resizeEnd();
}
grip.addEventListener('pointerup', endGrip);
grip.addEventListener('pointercancel', endGrip);

/* ---------- toolbar & input ---------- */

$('btn-open').addEventListener('click', openViaDialog);
$('btn-prev').addEventListener('click', () => goToPage(currentPageIndex() - 1));
$('btn-next').addEventListener('click', () => goToPage(currentPageIndex() + 1));
$('btn-zoom-in').addEventListener('click', () => setZoom(zoom * ZOOM_STEP));
$('btn-zoom-out').addEventListener('click', () => setZoom(zoom / ZOOM_STEP));
fitBtn.addEventListener('click', () => setZoom(1));
$('btn-hide').addEventListener('click', () => api.hide());
$('btn-quit').addEventListener('click', () => api.quit());

viewer.addEventListener('scroll', updatePageInfo, { passive: true });

viewer.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(e.deltaY < 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openViaDialog(); }
  else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoom * ZOOM_STEP); }
  else if (mod && e.key === '-') { e.preventDefault(); setZoom(zoom / ZOOM_STEP); }
  else if (mod && e.key === '0') { e.preventDefault(); setZoom(1); }
  else if (!mod && doc?.kind === 'pdf' && (e.key === 'PageDown' || e.key === 'PageUp')) {
    e.preventDefault();
    goToPage(currentPageIndex() + (e.key === 'PageDown' ? 1 : -1));
  }
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  if (doc?.kind === 'image') return layoutImage();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 150);
});

/* ---------- drag & drop ---------- */

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragover');
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dragover');
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) await loadFile(file.name, new Uint8Array(await file.arrayBuffer()));
});
