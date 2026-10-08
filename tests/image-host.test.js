const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const {
  cleanImageUrl,
  isDirectImageUrl,
  buildImageProxyUrl,
  resolveImageLink,
  uploadToPostimages
} = require('../lib/image-host');
const imageProxy = require('../api/image');

function createResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    end(payload) { if (payload !== undefined) this.body = payload; return this; }
  };
}

function proxyRequest(url, method = 'GET') {
  return { method, query: url === undefined ? {} : { u: url }, headers: {}, url: '/api/image' };
}
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


test('browser import exposes the shared image URL validator and proxy builder', () => {
  const browserContext = vm.createContext({ crypto: globalThis.crypto, URL });
  const moduleSource = readFileSync(require.resolve('../lib/image-host'), 'utf8');
  vm.runInContext(moduleSource, browserContext);
  assert.equal(
    browserContext.KhutuwatImageHost.cleanImageUrl('https://i.postimg.cc/a/image.jpg'),
    'https://i.postimg.cc/a/image.jpg'
  );
  // الصفحتان (script.js و admin.html) بتستخدموا الدالتين دول، فغيابهم بيكسر عرض الصور
  assert.equal(
    browserContext.KhutuwatImageHost.buildImageProxyUrl('https://i.postimg.cc/a/image.jpg'),
    '/api/image?u=https%3A%2F%2Fi.postimg.cc%2Fa%2Fimage.jpg'
  );
  assert.equal(browserContext.KhutuwatImageHost.isDirectImageUrl('https://postimg.cc/abc123'), false);
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

test('proxy URLs are only built for trusted image hosts', () => {
  assert.equal(
    buildImageProxyUrl('https://i.postimg.cc/abc/image.jpg'),
    '/api/image?u=https%3A%2F%2Fi.postimg.cc%2Fabc%2Fimage.jpg'
  );
  assert.equal(
    buildImageProxyUrl('https://postimg.cc/abc123'),
    '/api/image?u=https%3A%2F%2Fpostimg.cc%2Fabc123'
  );
  for (const url of ['https://evil.example/a.jpg', 'http://i.postimg.cc/a.jpg', '', 'not a url']) {
    assert.equal(buildImageProxyUrl(url), '', `expected no proxy URL for ${url}`);
  }
  assert.equal(isDirectImageUrl('https://i.postimg.cc/abc/image.jpg'), true);
  assert.equal(isDirectImageUrl('https://i.ibb.co/abc/image.png'), true);
  assert.equal(isDirectImageUrl('https://postimg.cc/abc123'), false);
  assert.equal(isDirectImageUrl('https://evil.example/a.jpg'), false);
});

test('image proxy streams a trusted image from our own origin', async t => {
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03]);
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://i.postimg.cc/abc/image.jpg');
    assert.match(options.headers.Accept, /image\//);
    return { ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => jpegBytes };
  });
  const response = createResponse();
  await imageProxy(proxyRequest('https://i.postimg.cc/abc/image.jpg'), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'image/jpeg');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.deepEqual(response.body, jpegBytes);
});

test('image proxy follows a photo page that answers with HTML instead of the image', async t => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
  const requested = [];
  t.mock.method(global, 'fetch', async url => {
    requested.push(url);
    if (url === 'https://i.postimg.cc/abc/image.jpg') {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: async () => '<meta property="og:image" content="https://i.postimg.cc/real/image.png">'
      };
    }
    return { ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => pngBytes };
  });
  const response = createResponse();
  await imageProxy(proxyRequest('https://i.postimg.cc/abc/image.jpg'), response);
  assert.deepEqual(requested, ['https://i.postimg.cc/abc/image.jpg', 'https://i.postimg.cc/real/image.png']);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.deepEqual(response.body, pngBytes);
});

test('image proxy refuses untrusted hosts, non-images, and unsupported methods', async t => {
  const untrusted = createResponse();
  await imageProxy(proxyRequest('https://evil.example/image.jpg'), untrusted);
  assert.equal(untrusted.statusCode, 400);
  assert.equal(untrusted.body.error, 'INVALID_IMAGE_URL');
  assert.equal(untrusted.headers['Cache-Control'], 'no-store');

  const missing = createResponse();
  await imageProxy(proxyRequest(undefined), missing);
  assert.equal(missing.statusCode, 400);

  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => '<html>hotlink denied</html>'
  }));
  const denied = createResponse();
  await imageProxy(proxyRequest('https://i.postimg.cc/abc/image.jpg'), denied);
  assert.equal(denied.statusCode, 502);
  assert.equal(denied.body.error, 'IMAGE_FETCH_FAILED');

  const rejectedMethod = createResponse();
  await imageProxy(proxyRequest('https://i.postimg.cc/abc/image.jpg', 'POST'), rejectedMethod);
  assert.equal(rejectedMethod.statusCode, 405);
});
