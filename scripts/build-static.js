// Builds the server-less version of the site into dist/ for static hosts
// (GitHub Pages). No dependencies — run with: node scripts/build-static.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');

// Swap `from` for `to`, failing loudly if index.ejs changed and the marker is gone
function swap(html, from, to) {
  if (!html.includes(from)) throw new Error('build-static: expected to find ' + from + ' in views/index.ejs');
  return html.replace(from, to);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.copyFileSync(path.join(root, 'views', 'resume.ejs'), path.join(out, 'resume.ejs'));

// The site lives under /resumemaker/ on GitHub Pages, so asset paths must be relative
let html = fs.readFileSync(path.join(root, 'views', 'index.ejs'), 'utf8');
html = swap(html, 'href="/css/styles.css"', 'href="css/styles.css"');
html = swap(html, '<script src="/js/app.js"></script>', [
  '<script src="https://cdn.jsdelivr.net/npm/ejs@3.1.10/ejs.min.js"></script>',
  '<script src="js/static.js"></script>',
  '<script src="js/app.js"></script>',
].join('\n'));
fs.writeFileSync(path.join(out, 'index.html'), html);

console.log('Static site written to ' + out);
