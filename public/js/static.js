/* ResumeForge — static hosting (GitHub Pages)
   There is no server on a static host, so the live preview and the PDF are both
   produced in the browser. app.js uses window.ResumeStatic whenever it exists;
   scripts/build-static.js is what adds this file to the page. */

window.ResumeStatic = (function () {
  const PDFMAKE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.23/';

  // ── Preview: same views/resume.ejs the server renders, compiled client-side ──
  let templatePromise = null;

  function renderPreview(data) {
    if (!templatePromise) {
      templatePromise = fetch('resume.ejs')
        .then(r => r.text())
        .then(src => ejs.compile(src));
    }
    return templatePromise.then(template => template({ data, isPdf: false }));
  }

  // ── PDF: real text (not an image) so ATS parsers can read it ────────────────
  // Sizes below mirror the CSS in views/resume.ejs — keep the two in sync.
  const INK = '#1e1b4b', ACCENT = '#4338ca', BULLET = '#6366f1', RULE = '#c7d2fe';
  const DARK = '#111827', BODY = '#374151', MUTED = '#6b7280', FAINT = '#9ca3af';

  const PAGE_W = 595.28;                 // A4, in points
  const MARGIN_X = 45.35 + 24;           // 16mm page margin + .page side padding
  const MARGIN_Y = 45.35;                // 16mm
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  // pdfmake's lineHeight multiplies the font's own line box (~1.17em for Roboto)
  const lh = css => css / 1.17;

  function rule(thickness, color, margin) {
    return {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: thickness, lineColor: color }],
      margin,
    };
  }

  // Left block with an optional right-aligned note (dates, link) on the same row
  function splitRow(left, right) {
    if (!right) return { stack: left };
    return {
      columns: [{ width: '*', stack: left }, Object.assign({ width: 'auto', noWrap: true }, right)],
      columnGap: 8,
    };
  }

  function section(title, body) {
    return {
      stack: [
        { text: title.toUpperCase(), fontSize: 9.5, bold: true, color: INK, characterSpacing: 0.76 },
        rule(1.1, RULE, [0, 2.25, 0, 6]),
      ].concat(body),
      margin: [0, 0, 0, 10.5],
    };
  }

  function bulletLines(text) {
    return text.split('\n').map(l => l.replace(/^[-•▸*]\s*/, '').trim()).filter(l => l.length > 0);
  }

  function bulletList(lines) {
    return {
      ul: lines.map(line => ({ text: line, margin: [0, 0, 0, 1.5] })),
      markerColor: BULLET,
      lineHeight: lh(1.55),
    };
  }

  function dateRange(start, end) {
    return (start || '') + (start || end ? ' – ' : '') + (end || '');
  }

  function experienceEntry(exp) {
    const left = [];
    if (exp.company) left.push({ text: exp.company, fontSize: 10, bold: true, color: DARK });
    if (exp.location) left.push({ text: exp.location, fontSize: 8.5, color: FAINT });
    const dates = dateRange(exp.startDate, exp.current ? 'Present' : exp.endDate);

    const stack = [splitRow(left, dates && { text: dates, fontSize: 8.5, color: MUTED })];
    if (exp.role) stack.push({ text: exp.role, fontSize: 9.5, bold: true, color: ACCENT, margin: [0, 1.5, 0, 3] });
    const lines = bulletLines(exp.bullets || '');
    if (lines.length) stack.push(bulletList(lines));
    return { stack, margin: [0, 0, 0, 7.5] };
  }

  function educationEntry(edu) {
    const left = [];
    if (edu.school) left.push({ text: edu.school, fontSize: 10, bold: true, color: DARK });
    const degree = [edu.degree, edu.field].filter(Boolean).join(', ');
    if (degree || edu.gpa) {
      const line = [degree];
      if (edu.gpa) line.push({ text: ' · GPA: ' + edu.gpa, fontSize: 8.5, color: MUTED });
      left.push({ text: line, margin: [0, 0.75, 0, 0] });
    }
    if (edu.honors) left.push({ text: edu.honors, fontSize: 8.5, color: MUTED });
    const dates = dateRange(edu.startYear, edu.endYear);

    return Object.assign(splitRow(left, dates && { text: dates, fontSize: 8.5, color: MUTED }), { margin: [0, 0, 0, 7.5] });
  }

  function skillRow(cat) {
    return {
      columns: [
        {
          width: 'auto',
          stack: [
            { text: cat.name + ':', fontSize: 9, bold: true, color: INK, noWrap: true, margin: [0, 0.45, 0, 0] },
            // zero-height spacer: the column is at least as wide as the CSS min-width (130px)
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 97.5, h: 0, color: '#ffffff' }] },
          ],
        },
        { width: '*', text: cat.skills.join(' · ') },
      ],
      columnGap: 4.5,
      margin: [0, 0, 0, 3.75],
    };
  }

  function projectEntry(proj) {
    const stack = [];
    const name = proj.name ? [{ text: proj.name, fontSize: 10, bold: true, color: DARK }] : [];
    stack.push(splitRow(name, proj.link && { text: proj.link, fontSize: 8, color: BULLET }));
    if (proj.tech) stack.push({ text: proj.tech, fontSize: 8.5, bold: true, color: ACCENT, margin: [0, 0, 0, 2.25] });
    if (proj.description) {
      const lines = bulletLines(proj.description);
      stack.push(lines.length > 1 ? bulletList(lines) : { text: proj.description });
    }
    return { stack, margin: [0, 0, 0, 7.5] };
  }

  function certRow(cert) {
    const line = [{ text: cert.name, bold: true, color: DARK }];
    if (cert.issuer) line.push({ text: ' · ' + cert.issuer, fontSize: 9, color: MUTED });
    return Object.assign(
      splitRow([{ text: line }], cert.date && { text: cert.date, fontSize: 8.5, color: FAINT }),
      { margin: [0, 0, 0, 3] }
    );
  }

  function buildDocument(d) {
    const body = [];
    const hasContent = d.fullName || d.summary || (d.experience && d.experience.length);

    if (!hasContent) {
      body.push({ text: 'Start filling in your details to see a live preview', color: '#d1d5db', alignment: 'center', margin: [0, 150, 0, 0] });
    } else {
      if (d.fullName) body.push({ text: d.fullName, fontSize: 22, bold: true, color: INK, lineHeight: 1 });
      if (d.jobTitle) body.push({ text: d.jobTitle, fontSize: 11, bold: true, color: ACCENT, margin: [0, 1.5, 0, 0] });
      const contacts = [d.email, d.phone, d.location, d.linkedin, d.website].filter(Boolean);
      if (contacts.length) {
        const line = [];
        contacts.forEach((c, i) => {
          if (i) line.push({ text: '  |  ', color: RULE });
          line.push(c);
        });
        body.push({ text: line, fontSize: 9, margin: [0, 6, 0, 0] });
      }
      body.push(rule(1.5, INK, [0, 9, 0, 10.5]));

      if (d.summary) {
        body.push(section('Professional Summary', [{ text: d.summary, lineHeight: lh(1.6) }]));
      }
      if (d.experience && d.experience.length) {
        body.push(section('Work Experience', d.experience.filter(e => e.company || e.role).map(experienceEntry)));
      }
      if (d.education && d.education.length) {
        body.push(section('Education', d.education.filter(e => e.school || e.degree).map(educationEntry)));
      }
      if (d.skillCategories && d.skillCategories.length) {
        body.push(section('Skills', d.skillCategories.filter(c => c.name && c.skills && c.skills.length).map(skillRow)));
      }
      if (d.projects && d.projects.length) {
        body.push(section('Projects', d.projects.filter(p => p.name || p.description).map(projectEntry)));
      }
      if (d.certifications && d.certifications.length) {
        body.push(section('Certifications & Awards', d.certifications.filter(c => c.name).map(certRow)));
      }
    }

    return {
      pageSize: 'A4',
      pageMargins: [MARGIN_X, MARGIN_Y, MARGIN_X, MARGIN_Y],
      info: { title: d.fullName || 'Resume' },
      defaultStyle: { fontSize: 9.5, color: BODY, lineHeight: lh(1.5) },
      // .page top padding (28px) sits above the header on the first page only
      content: [{ stack: body, margin: [0, 21, 0, 0] }],
    };
  }

  // pdfmake + its fonts are ~2 MB, so they are only fetched on the first download
  let pdfMakePromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function loadPdfMake() {
    if (!pdfMakePromise) {
      pdfMakePromise = loadScript(PDFMAKE_CDN + 'pdfmake.min.js')
        .then(() => loadScript(PDFMAKE_CDN + 'vfs_fonts.min.js'))
        .catch(err => { pdfMakePromise = null; throw err; });
    }
    return pdfMakePromise;
  }

  function downloadPDF(data) {
    return loadPdfMake().then(() => new Promise(resolve => {
      const name = (data.fullName || 'Resume').replace(/[^a-z0-9]/gi, '_');
      pdfMake.createPdf(buildDocument(data)).download(name + '_Resume.pdf', resolve);
    }));
  }

  return { renderPreview, downloadPDF, buildDocument };
})();
