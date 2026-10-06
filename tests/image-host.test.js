const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { cleanImageUrl, resolveImageLink, uploadToPostimages } = require('../lib/image-host');
test('direct URLs and security validation', async () => {
  for (const host of ['i.postimg.cc', 'i.ibb.co']) assert.equal(await resolveImageLink(`https://${host}/abc/image.jpg`), `https://${host}/abc/image.jpg`);
  for (const url of ['http://i.postimg.cc/x', 'https://localhost/x', 'https://i.postimg.cc.evil.com/x', 'https://user:pass@i.ibb.co/x', 'https://i.ibb.co:444/x']) await assert.rejects(resolveImageLink(url), /INVALID_IMAGE_URL/);
});
test('page links resolve only to trusted image hosts', async t => {
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'error');
    return { ok: true, text: async () => '<meta content="https://i.postimg.cc/abc/test.jpg?a=1&amp;b=2" property="og:image">' };
  });
  assert.equal(await resolveImageLink('https://postimg.cc/abcd'), 'https://i.postimg.cc/abc/test.jpg?a=1&b=2');
});
test('untrusted images from page metadata are rejected', async t => {
  t.mock.method(global, 'fetch', async () => ({ ok: true, text: async () => '<meta property="og:image" content="https://evil.com/a.jpg">' }));
  await assert.rejects(resolveImageLink('https://ibb.co/abcd'), /INVALID_IMAGE_URL/);
});
test('upload requires configuration', async () => {
  await assert.rejects(uploadToPostimages({}), /POSTIMAGES_NOT_CONFIGURED/);
});
test('upload uses unique names and resolves XML page response', async t => {
  const names = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    if (url === 'https://api.postimage.org/1/upload') {
      names.push(options.body.get('name'));
      assert.equal(options.body.get('type'), 'png');
      assert.equal(options.body.get('image'), 'aGVsbG8=');
      return { ok: true, text: async () => '<result><page>https://postimg.cc/abcd1234</page></result>' };
    }
    return { ok: true, text: async () => '<meta property="og:image" content="https://i.postimg.cc/test/image.png">' };
  });
  for (let i = 0; i < 2; i++) assert.equal(await uploadToPostimages({ apiKey: 'test', type: 'image/png', base64Image: 'aGVsbG8=' }), 'https://i.postimg.cc/test/image.png');
  assert.notEqual(names[0], names[1]);
});


test('browser import exposes the shared image URL validator', () => {
  const browserContext = vm.createContext({ crypto: globalThis.crypto, URL });
  const moduleSource = readFileSync(require.resolve('../lib/image-host'), 'utf8');
  vm.runInContext(moduleSource, browserContext);
  assert.equal(
    browserContext.KhutuwatImageHost.cleanImageUrl('https://i.postimg.cc/a/image.jpg'),
    'https://i.postimg.cc/a/image.jpg'
  );
});

test('admin and student pages accept the same trusted HTTPS image hosts', () => {
  const trustedUrls = [
    'https://i.postimg.cc/abc/image.jpg',
    'https://postimg.cc/abc123',
    'https://postimages.org/abc123',
    'https://www.postimages.org/abc123',
    'https://i.ibb.co/abc/image.png',
    'https://ibb.co/abc123'
  ];
  for (const url of trustedUrls) assert.equal(cleanImageUrl(url), url);
});

test('image URL policy rejects insecure, malformed, or untrusted URLs', () => {
  const rejectedUrls = [
    'http://i.postimg.cc/abc/image.jpg',
    'https://postimages.org.evil.example/image.jpg',
    'https://evil.example/image.jpg',
    'https://user:password@i.postimg.cc/abc/image.jpg',
    'https://i.postimg.cc:8443/abc/image.jpg',
    'javascript:alert(1)',
    'not a URL',
    `https://i.postimg.cc/${'a'.repeat(2048)}`
  ];
  for (const url of rejectedUrls) assert.equal(cleanImageUrl(url), '', `expected ${url} to be rejected`);
});
