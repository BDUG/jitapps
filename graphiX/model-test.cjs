const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeNode(tag, attrs = {}, ns = 'http://www.w3.org/2000/svg') {
  const node = {
    localName: tag,
    namespaceURI: ns,
    children: [],
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value, localName: name })),
    getAttribute(k) { return this.attributes.find(a => a.name === k)?.value ?? null; },
    setAttribute(k, v) {
      const a = this.attributes.find(x => x.name === k);
      if (a) a.value = String(v);
      else this.attributes.push({ name: k, value: String(v), localName: k });
    },
    removeAttribute(k) { this.attributes = this.attributes.filter(a => a.name !== k); },
    remove() { if (this._parent) this._parent.children = this._parent.children.filter(c => c !== this); },
  };
  return node;
}

class MockDOMParser {
  parseFromString(text) {
    if (!text.includes('<svg')) return { querySelector: () => ({}), documentElement: makeNode('html', {}, 'http://www.w3.org/1999/xhtml') };
    const vbMatch = /viewBox="([^"]+)"/.exec(text);
    const svg = makeNode('svg', vbMatch ? { viewBox: vbMatch[1] } : { width: '400', height: '300' });
    if (text.includes('<script')) {
      const s = makeNode('script', {}, 'http://www.w3.org/2000/svg');
      s._parent = svg;
      svg.children.push(s);
    }
    if (text.includes('<rect')) {
      const r = makeNode('rect', { width: '10', height: '10', onclick: 'alert(1)', fill: '#1e5a8a' });
      r._parent = svg;
      svg.children.push(r);
    }
    return { querySelector: () => null, documentElement: svg };
  }
}

const ctx = { DOMParser: MockDOMParser, globalThis: {} };
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'svg-clean.js'), 'utf8'), ctx);
const { clean } = ctx.GraphixSVG;

assert.throws(() => clean('x'.repeat(5e6 + 1)), /too large/);
assert.throws(() => clean('<div>not svg</div>'), /valid SVG/);
assert.throws(() => clean('<svg viewBox="0 0 25000 100"></svg>'), /between 1 and 20,000/);

const res = clean('<svg viewBox="0 0 800 600"><script>bad()</script><rect width="10" height="10" onclick="alert(1)" fill="#1e5a8a"/></svg>');
assert.equal(res.w, 800);
assert.equal(res.h, 600);
assert.equal(res.removed, 2); // <script> + onclick
assert.equal(res.svg.children.length, 1);
assert.equal(res.svg.children[0].getAttribute('onclick'), null);
assert.equal(res.svg.children[0].getAttribute('fill'), '#1e5a8a');
console.log('PASS graphiX svg-clean: size bounds, dimension bounds, script & event-handler scrubbing.');
