window.PW = window.PW || {};

PW.utils = (function () {
  'use strict';

  const GENRES = [
    'Fiction', 'Non-fiction', 'Fantasy', 'Science Fiction', 'Mystery', 'Romance',
    'Biography', 'Poetry', "Children's", 'Academic'
  ];

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    if (value === null || value === undefined) {
      return '';
    }
    let stringValue = String(value);
    return stringValue.replace(/[&<>"']/g, function (ch) {
      return ESC[ch];
    });
  }

  function uid(prefix) {
    if (!prefix) {
      prefix = 'id_';
    }
    let randomPart = Math.random().toString(36).slice(2, 9);
    let timePart = Date.now().toString(36).slice(-3);
    return prefix + randomPart + timePart;
  }

  const DATE_OPTS = { day: '2-digit', month: 'short', year: 'numeric' };

  function fmtDate(iso) {
    if (!iso) {
      return '—';
    }
    let formattedIso = iso;
    if (iso.length === 10) {
      formattedIso = iso + 'T00:00:00';
    }
    let d = new Date(formattedIso);
    if (Number.isNaN(d.getTime())) {
      return '—';
    }
    return d.toLocaleDateString('en-IN', DATE_OPTS);
  }

  function fmtDateTime(iso) {
    let d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return '—';
    }
    let options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleString('en-IN', options);
  }

  function timeAgo(iso) {
    let seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seconds < 60) {
      return 'just now';
    }
    let minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return minutes + ' min ago';
    }
    let hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours + ' h ago';
    }
    let days = Math.floor(hours / 24);
    if (days < 30) {
      return days + ' d ago';
    }
    return fmtDate(iso);
  }

  function todayISO() {
    let d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function daysUntil(isoDate) {
    let target = new Date(isoDate + 'T00:00:00');
    let now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  }

  const RX = {
    email: /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/,
    title: /^[\p{L}\p{N}\s'’:;,.!?&()\-]{3,120}$/u,
    personName: /^\p{L}[\p{L}\s.'’-]{1,59}$/u,
  };

  function isValidISBN13(raw) {
    let digits = String(raw).replace(/[-\s]/g, '');
    if (!/^\d{13}$/.test(digits)) {
      return false;
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      let weight = 1;
      if (i % 2 !== 0) {
        weight = 3;
      }
      sum += Number(digits[i]) * weight;
    }
    let checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === Number(digits[12]);
  }

  function generateISBN() {
    let body = '97893';
    for (let i = 0; i < 7; i++) {
      body += Math.floor(Math.random() * 10);
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      let weight = 1;
      if (i % 2 !== 0) {
        weight = 3;
      }
      sum += Number(body[i]) * weight;
    }
    let check = (10 - (sum % 10)) % 10;
    return body.slice(0, 3) + '-' + body.slice(3, 5) + '-' + body.slice(5, 10) + '-' + body.slice(10, 12) + '-' + check;
  }

  function validateManuscript(m) {
    let errors = [];
    let title = '';
    if (m.title) {
      title = m.title.trim();
    }
    if (!RX.title.test(title)) {
      errors.push('Title must be 3–120 characters (letters, numbers and basic punctuation).');
    }
    if (!GENRES.includes(m.genre)) {
      errors.push('Please choose a genre.');
    }
    let synopsis = '';
    if (m.synopsis) {
      synopsis = m.synopsis.trim();
    }
    if (synopsis.length < 20 || synopsis.length > 600) {
      errors.push('Synopsis must be 20–600 characters.');
    }
    let words = Number(m.wordCount);
    if (!Number.isInteger(words) || words < 1000 || words > 500000) {
      errors.push('Word count must be a whole number between 1,000 and 500,000.');
    }
    if (!m.authorId) {
      errors.push('An author is required.');
    }
    if (m.deadline) {
      let deadlineTime = new Date(m.deadline + 'T00:00:00').getTime();
      if (Number.isNaN(deadlineTime)) {
        errors.push('Deadline is not a valid date.');
      }
    }
    return errors;
  }

  function initials(name) {
    let nameString = String(name || '?');
    let words = nameString.split(/\s+/);
    let validWords = words.filter(function (w) { return Boolean(w); });
    let result = '';
    for (let i = 0; i < validWords.length && i < 2; i++) {
      result += validWords[i][0].toUpperCase();
    }
    return result;
  }

  function hashString(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = (h * 31 + text.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  function wrapText(text, maxChars, maxLines) {
    let lines = [];
    let line = '';
    let words = String(text).split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      let word = words[i];
      let testLine = line + ' ' + word;
      testLine = testLine.trim();
      
      if (testLine.length > maxChars && line !== '') {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line !== '') {
      lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let lastLine = lines[maxLines - 1];
      lines[maxLines - 1] = lastLine.replace(/.{0,2}$/, '…');
    }
    return lines;
  }

  function debounce(fn, wait) {
    if (!wait) {
      wait = 200;
    }
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn(...args);
      }, wait);
    };
  }

  function number(n) {
    return Number(n).toLocaleString('en-IN');
  }

  return {
    GENRES: GENRES,
    esc: esc,
    uid: uid,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    timeAgo: timeAgo,
    todayISO: todayISO,
    daysUntil: daysUntil,
    RX: RX,
    isValidISBN13: isValidISBN13,
    generateISBN: generateISBN,
    validateManuscript: validateManuscript,
    initials: initials,
    hashString: hashString,
    wrapText: wrapText,
    debounce: debounce,
    number: number
  };
})();
