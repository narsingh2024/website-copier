const express = require('express');
const serverless = require('serverless-http');
const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const puppeteerFull = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const bodyParser = require('body-parser');
const axios = require('axios');
const URL = require('url').URL;

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/api/clone', async (req, res) => {
  const targetUrl = req.body.url;
  if (!/^https?:\/\//.test(targetUrl)) {
    return res.status(400).send('Invalid URL');
  }

  const timestamp = Date.now().toString();
  const tempDir = path.join('/tmp', timestamp);
  await fs.ensureDir(tempDir);

  let browser;
  if (process.env.VERCEL || process.env.AWS_REGION) {
    browser = await puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });
  } else {
    browser = await puppeteerFull.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const base = new URL(targetUrl);
  const origin = base.origin;
  const visited = new Set();
  const queue = [targetUrl];
  const MAX = 5;

  const downloadAsset = async (assetUrl, dir) => {
    try {
      const urlObj = new URL(assetUrl, origin);
      const filePath = path.join(dir, urlObj.pathname);
      await fs.ensureDir(path.dirname(filePath));
      const resp = await axios.get(urlObj.href, { responseType: 'arraybuffer' });
      await fs.writeFile(filePath, resp.data);
    } catch (err) {
      console.warn('Asset err:', err.message);
    }
  };

  while (queue.length && visited.size < MAX) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    console.log('Crawling:', url);

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const html = await page.content();
    const parsed = new URL(url);
    const pageDir = path.join(tempDir, parsed.pathname === '/' ? '' : parsed.pathname);
    await fs.ensureDir(pageDir);
    await fs.writeFile(path.join(pageDir, 'index.html'), html);

    const links = await page.$$eval('a[href]', els => els.map(a => a.href));
    for (const raw of links) {
      try {
        const u = new URL(raw, origin).href.split('#')[0];
        if (u.startsWith(origin) && !visited.has(u) && !queue.includes(u) && visited.size + queue.length < MAX) {
          queue.push(u);
        }
      } catch {}
    }

    const assetUrls = await page.$$eval('img[src],link[rel=stylesheet],script[src]', els =>
      els.map(e => e.src || e.href)
    );
    for (const asset of assetUrls) {
      await downloadAsset(asset, pageDir);
    }

    await page.close();
  }

  await browser.close();

  const zipPath = path.join('/tmp', `${timestamp}.zip`);
  const out = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 }});
  archive.pipe(out);
  archive.directory(tempDir, false);
  await archive.finalize();
  out.on('close', () => res.download(zipPath, 'cloned-site.zip'));
});

module.exports = app;
module.exports.handler = serverless(app);
