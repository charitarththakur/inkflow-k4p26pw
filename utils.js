/* utils.js — small, dependency-free helpers shared by every other module.
   Everything is attached to one global namespace (window.PW) so the project
   works when opened straight from disk and on GitHub Pages without a build step. */
window.PW = window.PW || {};

PW.utils = (function () {
  'use strict';

  const GENRES = ['Fiction', 'Non-fiction', 'Fantasy', 'Science Fiction', 'Mystery', 'Romance',
    'Biography', 'Poetry', "Children's", 'Academic'];

  /* ---------- Security: always escape user text before putting it in HTML ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);

  const uid = (prefix = 'id_') => prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  /* ---------- Dates (Unit V: Date and Time Handling) ---------- */
  const DATE_OPTS = { day: '2-digit', month: 'short', year: 'numeric' };
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', DATE_OPTS);
  };
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—'
      : d.toLocaleString('en-IN', { ...DATE_OPTS, hour: '2-digit', minute: '2-digit' });
  };
  const timeAgo = (iso) => {
    const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    return days < 30 ? `${days} d ago` : fmtDate(iso);
  };
  const todayISO = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());   // local date, not UTC
    return d.toISOString().slice(0, 10);
  };
  /** Whole days from today until a YYYY-MM-DD date (negative = in the past). */
  const daysUntil = (isoDate) => {
    const target = new Date(isoDate + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  };

  /* ---------- Validation (Unit V: Regular Expressions + Form Validation) ---------- */
  const RX = {
    email: /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/,
    title: /^[\p{L}\p{N}\s'’:;,.!?&()\-]{3,120}$/u,
    personName: /^\p{L}[\p{L}\s.'’-]{1,59}$/u,
  };

  /** ISBN-13 = 13 digits whose weighted checksum (weights 1,3,1,3…) is divisible by 10. */
  function isValidISBN13(raw) {
    const digits = String(raw).replace(/[-\s]/g, '');
    if (!/^\d{13}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(digits[12]);
  }

  /** Makes a valid, hyphenated ISBN-13 (978-93 = India prefix). */
  function generateISBN() {
    let body = '97893';
    for (let i = 0; i < 7; i += 1) body += Math.floor(Math.random() * 10);
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(body[i]) * (i % 2 ? 3 : 1);
    const check = (10 - (sum % 10)) % 10;
    return `${body.slice(0, 3)}-${body.slice(3, 5)}-${body.slice(5, 10)}-${body.slice(10, 12)}-${check}`;
  }

  /** Returns an array of human-readable problems (empty array = valid). */
  function validateManuscript(m) {
    const errors = [];
    if (!RX.title.test((m.title || '').trim())) errors.push('Title must be 3–120 characters (letters, numbers and basic punctuation).');
    if (!GENRES.includes(m.genre)) errors.push('Please choose a genre.');
    const synopsis = (m.synopsis || '').trim();
    if (synopsis.length < 20 || synopsis.length > 600) errors.push('Synopsis must be 20–600 characters.');
    const words = Number(m.wordCount);
    if (!Number.isInteger(words) || words < 1000 || words > 500000) errors.push('Word count must be a whole number between 1,000 and 500,000.');
    if (!m.authorId) errors.push('An author is required.');
    if (m.deadline && Number.isNaN(new Date(m.deadline + 'T00:00:00').getTime())) errors.push('Deadline is not a valid date.');
    return errors;
  }

  /* ---------- Misc ---------- */
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('');

  const hashString = (text) => {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
  };

  /** Greedy word-wrap used to lay out titles on the generated SVG covers. */
  function wrapText(text, maxChars, maxLines) {
    const lines = [];
    let line = '';
    String(text).split(/\s+/).forEach((word) => {
      if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…');
    }
    return lines;
  }

  const debounce = (fn, wait = 200) => {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  };

  const number = (n) => Number(n).toLocaleString('en-IN');

  return { GENRES, esc, uid, fmtDate, fmtDateTime, timeAgo, todayISO, daysUntil, RX,
    isValidISBN13, generateISBN, validateManuscript, initials, hashString, wrapText, debounce, number };
})();
