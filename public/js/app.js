/* ResumeForge — main app logic */

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  experiences: [],
  educations: [],
  skillCategories: [],
  projects: [],
  certifications: [],
};

let previewDebounce = null;

// Date.now() alone repeats when items are added in the same millisecond (init does this)
let lastId = 0;
function newId() {
  lastId = Math.max(Date.now(), lastId + 1);
  return lastId;
}

// ── Mobile view toggle (Edit ↔ Preview) ───────────────────────────────────
function switchMobileView(view) {
  const formCol = document.getElementById('formCol');
  const previewCol = document.getElementById('previewCol');
  const editBtn = document.getElementById('mobileEditBtn');
  const previewBtn = document.getElementById('mobilePreviewBtn');

  if (view === 'preview') {
    formCol.classList.add('mobile-hidden');
    previewCol.classList.remove('mobile-hidden');
    editBtn.classList.remove('active');
    editBtn.classList.add('text-gray-500');
    previewBtn.classList.add('active');
    previewBtn.classList.remove('text-gray-500');
    refreshPreview();
  } else {
    previewCol.classList.add('mobile-hidden');
    formCol.classList.remove('mobile-hidden');
    previewBtn.classList.remove('active');
    previewBtn.classList.add('text-gray-500');
    editBtn.classList.add('active');
    editBtn.classList.remove('text-gray-500');
  }
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('tab-' + name).classList.remove('hidden');
  // Only the section tabs — the mobile Edit/Preview toggle shares the .tab-btn style
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('text-gray-500', !isActive);
  });
}

// ── Collect form data ──────────────────────────────────────────────────────
function collectData() {
  return {
    fullName:  v('fullName'),
    jobTitle:  v('jobTitle'),
    email:     v('email'),
    phone:     v('phone'),
    location:  v('location'),
    linkedin:  v('linkedin'),
    website:   v('website'),
    summary:   v('summary'),
    experience:     state.experiences.map(readExperience),
    education:      state.educations.map(readEducation),
    skillCategories: state.skillCategories.map(readSkillCategory),
    projects:       state.projects.map(readProject),
    certifications: state.certifications.map(readCert),
  };
}

function v(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

// ── Preview ────────────────────────────────────────────────────────────────
let previewSeq = 0;

function refreshPreview() {
  const data = collectData();
  const seq = ++previewSeq;
  // On a static host (GitHub Pages) there is no server — static.js renders it in the browser
  const rendered = window.ResumeStatic
    ? window.ResumeStatic.renderPreview(data)
    : fetch('/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.text());

  rendered
    .then(html => {
      if (seq !== previewSeq) return; // a newer preview was requested while this one loaded
      const frame = document.getElementById('previewFrame');
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
      fitPreview();
      // The web font arrives after the first layout and changes the content height
      frame.contentWindow.addEventListener('load', fitPreview);
      if (doc.fonts) doc.fonts.ready.then(fitPreview);
    });
}

// Scale the A4 page (794px) down to fit the available width on small screens
function fitPreview() {
  const scroll = document.getElementById('previewScroll');
  const sizer = document.getElementById('previewSizer');
  const page = document.getElementById('previewPage');
  const frame = document.getElementById('previewFrame');
  if (!scroll || !sizer || !page || !frame) return;
  const PAGE_W = 794, PAGE_H = 1123;
  const available = scroll.clientWidth - 16; // account for px-2 padding
  if (available <= 0) return; // column is hidden (display:none) — recompute when shown
  // Grow the page with the resume: a fixed-height frame would scroll on its own and
  // jump back to the top on every refresh once the content passes one page
  const body = frame.contentDocument && frame.contentDocument.body;
  const pageH = Math.max(PAGE_H, body ? body.offsetHeight : 0);
  frame.style.height = pageH + 'px';
  const scale = Math.min(1, available / PAGE_W);
  page.style.transform = `scale(${scale})`;
  // The sizer reserves the *scaled* footprint so layout/scroll stay correct
  sizer.style.width = (PAGE_W * scale) + 'px';
  sizer.style.height = (pageH * scale) + 'px';
}
window.addEventListener('resize', fitPreview);

function schedulePreview() {
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(refreshPreview, 600);
}

// Attach auto-refresh to all form inputs
document.addEventListener('input', (e) => {
  if (e.target.matches('.field-input, .field-textarea')) {
    schedulePreview();
    updateAts();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.matches('input[type="checkbox"]')) {
    schedulePreview();
  }
});

// ── PDF download ───────────────────────────────────────────────────────────
// Uses a native form POST instead of fetch+blob — the most reliable way to
// download a binary file without JavaScript mangling the bytes in transit.
function downloadPDF() {
  const data = collectData();
  const overlay = document.getElementById('pdfOverlay');
  overlay.classList.remove('hidden');

  if (window.ResumeStatic) {
    window.ResumeStatic.downloadPDF(data)
      .catch(() => alert('Could not generate the PDF. Check your connection and try again.'))
      .then(() => overlay.classList.add('hidden'));
    return;
  }

  // The response lands in a hidden iframe so a server error can't replace the page (and
  // the resume typed into it). A download never fires load there; an error page does.
  document.getElementById('pdfTarget').onload = () => {
    overlay.classList.add('hidden');
    alert('Could not generate the PDF. Please try again.');
  };
  document.getElementById('pdfJsonData').value = JSON.stringify(data);
  document.getElementById('pdfForm').submit();

  // Hide the overlay after a generous delay — the browser takes over from here
  setTimeout(() => overlay.classList.add('hidden'), 5000);
}

// ── ATS Score ─────────────────────────────────────────────────────────────
function updateAts() {
  let score = 0;
  // Blank entries (the form starts with a few) must not count towards the score
  const exps  = state.experiences.filter(id => v('exp-company-' + id) || v('exp-role-' + id));
  const edus  = state.educations.filter(id => v('edu-school-' + id) || v('edu-degree-' + id));
  const projs = state.projects.filter(id => v('proj-name-' + id) || v('proj-desc-' + id));
  const certs = state.certifications.filter(id => v('cert-name-' + id));
  const skillCount = state.skillCategories.reduce((t, id) => t + getSkills(id).length, 0);
  const checks = [
    () => !!v('fullName'),
    () => !!v('jobTitle'),
    () => !!v('email'),
    () => !!v('phone'),
    () => !!v('location'),
    () => { const s = v('summary'); return s.length > 100; },
    () => { const s = v('summary'); return s.split(/\s+/).length >= 40; },
    () => exps.length >= 1,
    () => exps.length >= 2,
    () => exps.some(id => {
      const b = v('exp-bullets-' + id); return b && b.split('\n').filter(l => l.trim()).length >= 3;
    }),
    () => exps.some(id => {
      const b = v('exp-bullets-' + id);
      return /\d+%|\d+x|\$[\d,]+|\d+ (engineers|people|users|customers|million|billion)/.test(b);
    }),
    () => edus.length >= 1,
    () => skillCount >= 1,
    () => skillCount >= 5,
    () => skillCount >= 10,
    () => !!v('linkedin'),
    () => !!v('website'),
    () => projs.length >= 1,
    () => certs.length >= 1,
    () => exps.some(id => v('exp-company-' + id).length > 0),
  ];

  checks.forEach(fn => { try { if (fn()) score++; } catch (_) {} });
  const pct = Math.round((score / checks.length) * 100);

  const ring = document.getElementById('atsRing');
  const text = document.getElementById('atsScoreText');
  const label = document.getElementById('atsLabel');
  const circumference = 2 * Math.PI * 18; // r=18
  const offset = circumference - (pct / 100) * circumference;
  ring.style.strokeDashoffset = offset;
  text.textContent = pct + '%';

  if (pct === 0) {
    label.textContent = 'Fill in your info';
  } else if (pct < 40) {
    ring.setAttribute('stroke', '#f87171');
    label.textContent = 'Needs work';
  } else if (pct < 65) {
    ring.setAttribute('stroke', '#fb923c');
    label.textContent = 'Getting there';
  } else if (pct < 80) {
    ring.setAttribute('stroke', '#facc15');
    label.textContent = 'Good';
  } else if (pct < 95) {
    ring.setAttribute('stroke', '#34d399');
    label.textContent = 'Great!';
  } else {
    ring.setAttribute('stroke', '#818cf8');
    label.textContent = 'Excellent!';
  }

  // Word count for summary
  const words = (v('summary') || '').split(/\s+/).filter(w => w).length;
  const wc = document.getElementById('summaryCount');
  if (wc) wc.textContent = words + ' words' + (words < 40 ? ' (aim for 40–80)' : '');
}

// Relabel "Experience #1…#n" after a removal so the numbers stay sequential and unique
function renumber(listId, label) {
  document.querySelectorAll('#' + listId + ' .item-number').forEach((el, i) => {
    el.textContent = label + ' #' + (i + 1);
  });
}

// ── EXPERIENCE ────────────────────────────────────────────────────────────
function addExperience() {
  const id = newId();
  state.experiences.push(id);
  const container = document.getElementById('experienceList');
  const el = document.createElement('div');
  el.id = 'exp-' + id;
  el.className = 'mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="item-number text-xs font-semibold text-gray-600">Experience #${state.experiences.length}</span>
      <button class="btn-danger" onclick="removeExperience(${id})">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        Remove
      </button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="field-label">Company / Organization *</label>
        <input id="exp-company-${id}" class="field-input" type="text" placeholder="Google, Apple, Meta…"/>
      </div>
      <div>
        <label class="field-label">Job Title / Role *</label>
        <input id="exp-role-${id}" class="field-input" type="text" placeholder="Senior Software Engineer"/>
      </div>
      <div>
        <label class="field-label">Start Date</label>
        <input id="exp-start-${id}" class="field-input" type="text" placeholder="Jan 2021"/>
      </div>
      <div>
        <label class="field-label">End Date</label>
        <div class="flex gap-2 items-center">
          <input id="exp-end-${id}" class="field-input" type="text" placeholder="Dec 2023"/>
          <label class="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap cursor-pointer">
            <input type="checkbox" id="exp-current-${id}" class="rounded text-brand-600" onchange="toggleCurrent(${id})"/>
            Present
          </label>
        </div>
      </div>
      <div class="col-span-2">
        <label class="field-label">Location</label>
        <input id="exp-location-${id}" class="field-input" type="text" placeholder="Mountain View, CA / Remote"/>
      </div>
      <div class="col-span-2">
        <label class="field-label">Key Achievements & Responsibilities *</label>
        <p class="text-xs text-gray-400 mb-1">One bullet per line. Start with action verbs. Include numbers.</p>
        <textarea id="exp-bullets-${id}" class="field-textarea" rows="5"
          placeholder="• Led migration of monolith to microservices, reducing deployment time by 60%&#10;• Built real-time data pipeline processing 2M events/day with 99.9% uptime&#10;• Mentored 4 junior engineers through weekly 1:1s and code reviews&#10;• Collaborated cross-functionally with PM and Design to ship 3 major features per quarter"></textarea>
      </div>
    </div>`;
  container.appendChild(el);
  schedulePreview();
  updateAts();
}

function toggleCurrent(id) {
  const cb = document.getElementById('exp-current-' + id);
  const endInput = document.getElementById('exp-end-' + id);
  if (cb && endInput) {
    endInput.disabled = cb.checked;
    endInput.classList.toggle('opacity-40', cb.checked);
  }
  schedulePreview();
}

function removeExperience(id) {
  state.experiences = state.experiences.filter(e => e !== id);
  document.getElementById('exp-' + id)?.remove();
  renumber('experienceList', 'Experience');
  schedulePreview();
  updateAts();
}

function readExperience(id) {
  return {
    company:   v('exp-company-' + id),
    role:      v('exp-role-' + id),
    startDate: v('exp-start-' + id),
    endDate:   v('exp-end-' + id),
    current:   document.getElementById('exp-current-' + id)?.checked || false,
    location:  v('exp-location-' + id),
    bullets:   v('exp-bullets-' + id),
  };
}

// ── EDUCATION ─────────────────────────────────────────────────────────────
function addEducation() {
  const id = newId();
  state.educations.push(id);
  const container = document.getElementById('educationList');
  const el = document.createElement('div');
  el.id = 'edu-' + id;
  el.className = 'mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="item-number text-xs font-semibold text-gray-600">Education #${state.educations.length}</span>
      <button class="btn-danger" onclick="removeEducation(${id})">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        Remove
      </button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2">
        <label class="field-label">School / University *</label>
        <input id="edu-school-${id}" class="field-input" type="text" placeholder="Massachusetts Institute of Technology"/>
      </div>
      <div>
        <label class="field-label">Degree</label>
        <input id="edu-degree-${id}" class="field-input" type="text" placeholder="Bachelor of Science"/>
      </div>
      <div>
        <label class="field-label">Field of Study</label>
        <input id="edu-field-${id}" class="field-input" type="text" placeholder="Computer Science"/>
      </div>
      <div>
        <label class="field-label">Start Year</label>
        <input id="edu-start-${id}" class="field-input" type="text" placeholder="2018"/>
      </div>
      <div>
        <label class="field-label">End Year (or Expected)</label>
        <input id="edu-end-${id}" class="field-input" type="text" placeholder="2022"/>
      </div>
      <div>
        <label class="field-label">GPA (optional)</label>
        <input id="edu-gpa-${id}" class="field-input" type="text" placeholder="3.9 / 4.0"/>
      </div>
      <div>
        <label class="field-label">Honors / Awards</label>
        <input id="edu-honors-${id}" class="field-input" type="text" placeholder="Magna Cum Laude, Dean's List"/>
      </div>
    </div>`;
  container.appendChild(el);
  schedulePreview();
  updateAts();
}

function removeEducation(id) {
  state.educations = state.educations.filter(e => e !== id);
  document.getElementById('edu-' + id)?.remove();
  renumber('educationList', 'Education');
  schedulePreview();
  updateAts();
}

function readEducation(id) {
  return {
    school:    v('edu-school-' + id),
    degree:    v('edu-degree-' + id),
    field:     v('edu-field-' + id),
    startYear: v('edu-start-' + id),
    endYear:   v('edu-end-' + id),
    gpa:       v('edu-gpa-' + id),
    honors:    v('edu-honors-' + id),
  };
}

// ── SKILLS ────────────────────────────────────────────────────────────────
function addSkillCategory() {
  const id = newId();
  state.skillCategories.push(id);
  const container = document.getElementById('skillCategories');
  const el = document.createElement('div');
  el.id = 'skill-cat-' + id;
  el.className = 'mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <input id="skill-name-${id}" class="field-input text-xs font-semibold flex-1 mr-2"
             placeholder="e.g. Programming Languages, Frameworks, Cloud Platforms…"/>
      <button class="btn-danger" onclick="removeSkillCategory(${id})">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
    <div id="skill-tags-${id}" class="flex flex-wrap gap-1 mb-2 min-h-[24px]"></div>
    <div class="flex gap-2">
      <input id="skill-input-${id}" class="field-input text-xs flex-1" placeholder="Type a skill and press Enter or comma"/>
      <button class="btn-ghost text-xs" onclick="addSkillTag(${id})">Add</button>
    </div>`;
  container.appendChild(el);

  const skillInput = document.getElementById('skill-input-' + id);
  skillInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkillTag(id);
    }
  });
  // Mobile keyboards don't report the comma key, and a paste skips keydown entirely
  skillInput.addEventListener('input', () => {
    if (skillInput.value.includes(',')) addSkillTag(id);
  });
  // A skill typed but never confirmed would silently be left off the resume
  skillInput.addEventListener('blur', () => addSkillTag(id));
  schedulePreview();
}

function addSkillTag(id) {
  const input = document.getElementById('skill-input-' + id);
  // "Python, Java, Go" is three skills, not one
  const skills = input.value.split(',').map(s => s.trim()).filter(Boolean);
  input.value = '';
  if (!skills.length) return;
  const container = document.getElementById('skill-tags-' + id);
  skills.forEach(val => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.dataset.value = val;
    tag.textContent = val; // not innerHTML: a skill like "C <3" must show as typed
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.onclick = () => removeSkillTag(remove, id);
    tag.appendChild(remove);
    container.appendChild(tag);
  });
  schedulePreview();
  updateAts();
}

function removeSkillTag(btn, id) {
  btn.parentElement.remove();
  schedulePreview();
  updateAts();
}

function removeSkillCategory(id) {
  state.skillCategories = state.skillCategories.filter(s => s !== id);
  document.getElementById('skill-cat-' + id)?.remove();
  schedulePreview();
  updateAts();
}

function getSkills(id) {
  return Array.from(document.querySelectorAll(`#skill-tags-${id} .skill-tag`))
    .map(el => el.dataset.value).filter(Boolean);
}

function readSkillCategory(id) {
  return {
    name:   v('skill-name-' + id),
    skills: getSkills(id),
  };
}

// ── PROJECTS ──────────────────────────────────────────────────────────────
function addProject() {
  const id = newId();
  state.projects.push(id);
  const container = document.getElementById('projectList');
  const el = document.createElement('div');
  el.id = 'proj-' + id;
  el.className = 'mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="item-number text-xs font-semibold text-gray-600">Project #${state.projects.length}</span>
      <button class="btn-danger" onclick="removeProject(${id})">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        Remove
      </button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="field-label">Project Name *</label>
        <input id="proj-name-${id}" class="field-input" type="text" placeholder="Distributed Task Scheduler"/>
      </div>
      <div>
        <label class="field-label">Link (GitHub / Live)</label>
        <input id="proj-link-${id}" class="field-input" type="text" placeholder="github.com/you/project"/>
      </div>
      <div class="col-span-2">
        <label class="field-label">Technologies Used</label>
        <input id="proj-tech-${id}" class="field-input" type="text" placeholder="Go, Kubernetes, Redis, gRPC"/>
      </div>
      <div class="col-span-2">
        <label class="field-label">Description / Impact *</label>
        <textarea id="proj-desc-${id}" class="field-textarea" rows="3"
          placeholder="• Built a distributed task scheduler handling 500K jobs/day with sub-100ms latency&#10;• Reduced infrastructure costs by 35% through intelligent job batching algorithms"></textarea>
      </div>
    </div>`;
  container.appendChild(el);
  schedulePreview();
}

function removeProject(id) {
  state.projects = state.projects.filter(p => p !== id);
  document.getElementById('proj-' + id)?.remove();
  renumber('projectList', 'Project');
  schedulePreview();
  updateAts();
}

function readProject(id) {
  return {
    name:        v('proj-name-' + id),
    link:        v('proj-link-' + id),
    tech:        v('proj-tech-' + id),
    description: v('proj-desc-' + id),
  };
}

// ── CERTIFICATIONS ────────────────────────────────────────────────────────
function addCert() {
  const id = newId();
  state.certifications.push(id);
  const container = document.getElementById('certList');
  const el = document.createElement('div');
  el.id = 'cert-' + id;
  el.className = 'mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <span class="item-number text-xs font-semibold text-gray-600">Certification #${state.certifications.length}</span>
      <button class="btn-danger" onclick="removeCert(${id})">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        Remove
      </button>
    </div>
    <div class="grid grid-cols-3 gap-3">
      <div class="col-span-3">
        <label class="field-label">Certification / Award Name *</label>
        <input id="cert-name-${id}" class="field-input" type="text" placeholder="AWS Certified Solutions Architect – Professional"/>
      </div>
      <div class="col-span-2">
        <label class="field-label">Issuing Organization</label>
        <input id="cert-issuer-${id}" class="field-input" type="text" placeholder="Amazon Web Services"/>
      </div>
      <div>
        <label class="field-label">Date</label>
        <input id="cert-date-${id}" class="field-input" type="text" placeholder="Mar 2024"/>
      </div>
    </div>`;
  container.appendChild(el);
  schedulePreview();
}

function removeCert(id) {
  state.certifications = state.certifications.filter(c => c !== id);
  document.getElementById('cert-' + id)?.remove();
  renumber('certList', 'Certification');
  schedulePreview();
  updateAts();
}

function readCert(id) {
  return {
    name:   v('cert-name-' + id),
    issuer: v('cert-issuer-' + id),
    date:   v('cert-date-' + id),
  };
}

// ── Init ───────────────────────────────────────────────────────────────────
(function init() {
  // Seed with one empty experience, education, and skill category so users know what to do
  addExperience();
  addEducation();
  addSkillCategory();
  document.getElementById('skill-name-' + state.skillCategories[0]).value = 'Programming Languages';
  addSkillCategory();
  document.getElementById('skill-name-' + state.skillCategories[1]).value = 'Frameworks & Tools';
  addSkillCategory();
  document.getElementById('skill-name-' + state.skillCategories[2]).value = 'Cloud & Infrastructure';
  refreshPreview();
  updateAts();
})();
