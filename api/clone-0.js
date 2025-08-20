const express = require('express');
const serverless = require('serverless-http');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const bodyParser = require('body-parser');
const axios = require('axios');
const { URL } = require('url');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/api/clone', async (req, res) => {
  const targetUrl = req.body.url;
  if (!/^https?:\/\//.test(targetUrl)) {
    return res.status(400).send('Invalid URL.');
  }

  const timestamp = Date.now().toString();
  const tempDir = path.join('/tmp', 'downloads', timestamp);
  const assetsDir = path.join(tempDir, './assets');
  await fs.ensureDir(assetsDir);

  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const html = await page.content();
    const assetUrls = await page.evaluate(() => [
      ...Array.from(document.querySelectorAll('img')).map(i => i.src),
      ...Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href),
      ...Array.from(document.querySelectorAll('script[src]')).map(s => s.src)
    ]);

    // Download assets and map original → local paths
    const mapping = await Promise.all(assetUrls.map(url => downloadAssetAndMap(url, targetUrl, assetsDir)));
    await browser.close();

    // Update HTML based on mapping
    const updatedHtml = updateHtmlAssetPaths(html, mapping);

    await fs.writeFile(path.join(tempDir, 'index.html'), updatedHtml);

    // Zip and serve the folder
    const zipPath = path.join('/tmp', `${timestamp}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    archive.directory(tempDir, false);
    await archive.finalize();
    output.on('close', () => res.download(zipPath, 'cloned-site.zip'));
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Failed to clone site.');
  }
});

// Download asset, mirror folder structure, and return mapping
async function downloadAssetAndMap(assetUrl, baseUrl, assetsDir) {
  try {
    const fullUrl = new URL(assetUrl, baseUrl).href;
    const assetPath = new URL(fullUrl).pathname.replace(/^\/+/, ''); // e.g. 'etc/clientlibs/...'
    const localPath = path.join(assetsDir, assetPath);
    await fs.ensureDir(path.dirname(localPath));

    const { data } = await axios.get(fullUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(localPath, data);
    return { original: assetUrl, local: `/assets/${assetPath}` };
  } catch (err) {
    console.warn(`Error downloading ${assetUrl}:`, err.message);
    return null;
  }
}

// Apply mapping to update HTML asset paths
function updateHtmlAssetPaths(html, mapping) {
  let updated = html;
  mapping.forEach(entry => {
    if (!entry) return;
    const escapedOriginal = entry.original.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escapedOriginal, 'g');
    updated = updated.replace(regex, entry.local);
  });
  return updated;
}

module.exports = app;
module.exports.handler = serverless(app);
