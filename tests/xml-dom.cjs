// Test-only DOM adapter. The standalone dashboard uses the browser's DOMParser.
const path = require('node:path');
const {spawnSync} = require('node:child_process');

class Element {
  constructor(data) {
    this.tagName = data.name;
    this.attributes = data.attrs;
    this.textContent = data.text;
    this.children = data.children.map(child => new Element(child));
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  getAttributeNS(namespace, name) {
    return this.getAttribute(namespace ? `{${namespace}}${name}` : name);
  }
  getElementsByTagName(name) {
    return this.children.flatMap(child => [
      ...(name === '*' || child.tagName === name ? [child] : []),
      ...child.getElementsByTagName(name),
    ]);
  }
  getElementsByTagNameNS(namespace, name) {
    if (namespace !== '*') throw Error('The test adapter supports wildcard tag namespaces only');
    return this.getElementsByTagName(name);
  }
}

class DOMParser {
  parseFromString(xml) {
    const result = spawnSync('python3', [path.join(__dirname, 'xml-dom.py')], {
      input: xml, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    const data = result.status === 0 ? JSON.parse(result.stdout) : {
      name: 'parsererror', attrs: {}, text: result.stderr, children: [],
    };
    return new Element({name: '#document', attrs: {}, text: data.text, children: [data]});
  }
}

module.exports = {DOMParser};
