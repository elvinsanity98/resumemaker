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
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.classList.add('text-gray-500');
  });
  const tabs = ['basics', 'experience', 'education', 'skills', 'extras'];
  const idx = tabs.indexOf(name);
  const btns = document.querySelectorAll('.tab-btn');
  if (btns[idx]) {
    btns[idx].classList.add('active');
    btns[idx].classList.remove('text-gray-500');
  }
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
function refreshPreview() {
  const data = collectData();
  fetch('/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
    .then(r => r.text())
    .then(html => {
      const frame = document.getElementById('previewFrame');
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
    });
}

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

  document.getElementById('pdfJsonData').value = JSON.stringify(data);
  document.getElementById('pdfForm').submit();

  // Hide the overlay after a generous delay — the browser takes over from here
  setTimeout(() => overlay.classList.add('hidden'), 5000);
}

// ── ATS Score ─────────────────────────────────────────────────────────────
function updateAts() {
  let score = 0;
  const checks = [
    () => !!v('fullName'),
    () => !!v('jobTitle'),
    () => !!v('email'),
    () => !!v('phone'),
    () => !!v('location'),
    () => { const s = v('summary'); return s.length > 100; },
    () => { const s = v('summary'); return s.split(/\s+/).length >= 40; },
    () => state.experiences.length >= 1,
    () => state.experiences.length >= 2,
    () => state.experiences.some(id => {
      const b = v('exp-bullets-' + id); return b && b.split('\n').filter(l => l.trim()).length >= 3;
    }),
    () => state.experiences.some(id => {
      const b = v('exp-bullets-' + id);
      return /\d+%|\d+x|\$[\d,]+|\d+ (engineers|people|users|customers|million|billion)/.test(b);
    }),
    () => state.educations.length >= 1,
    () => state.skillCategories.length >= 1,
    () => state.skillCategories.reduce((t, id) => t + getSkills(id).length, 0) >= 5,
    () => state.skillCategories.reduce((t, id) => t + getSkills(id).length, 0) >= 10,
    () => !!v('linkedin'),
    () => !!v('website'),
    () => state.projects.length >= 1,
    () => state.certifications.length >= 1,
    () => state.experiences.some(id => v('exp-company-' + id).length > 0),
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

  if (pct < 40) {
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

// ── EXPERIENCE ────────────────────────────────────────────────────────────
function addExperience() {
  const id = Date.now();
  state.experiences.push(id);
  const container = document.getElementById('experienceList');
  const el = document.createElement('div');
  el.id = 'exp-' + id;
  el.className = 'mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="text-xs font-semibold text-gray-600">Experience #${state.experiences.length}</span>
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
  const id = Date.now();
  state.educations.push(id);
  const container = document.getElementById('educationList');
  const el = document.createElement('div');
  el.id = 'edu-' + id;
  el.className = 'mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="text-xs font-semibold text-gray-600">Education #${state.educations.length}</span>
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
  const id = Date.now();
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

  document.getElementById('skill-input-' + id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkillTag(id);
    }
  });
  schedulePreview();
}

function addSkillTag(id) {
  const input = document.getElementById('skill-input-' + id);
  const val = input.value.replace(/,/g, '').trim();
  if (!val) return;
  const container = document.getElementById('skill-tags-' + id);
  const tag = document.createElement('span');
  tag.className = 'skill-tag';
  tag.dataset.value = val;
  tag.innerHTML = `${val}<button type="button" onclick="removeSkillTag(this, ${id})">×</button>`;
  container.appendChild(tag);
  input.value = '';
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
  const id = Date.now();
  state.projects.push(id);
  const container = document.getElementById('projectList');
  const el = document.createElement('div');
  el.id = 'proj-' + id;
  el.className = 'mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="text-xs font-semibold text-gray-600">Project #${state.projects.length}</span>
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
  schedulePreview();
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
  const id = Date.now();
  state.certifications.push(id);
  const container = document.getElementById('certList');
  const el = document.createElement('div');
  el.id = 'cert-' + id;
  el.className = 'mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100';
  el.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs font-semibold text-gray-600">Certification #${state.certifications.length}</span>
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
  schedulePreview();
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
