// localhost and versal to both
const express = require('express');
const serverless = require('serverless-http');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/api/clone', async (req, res) => {
  const targetUrl = req.body.url;
  if (!/^https?:\/\//.test(targetUrl)) {
    return res.status(400).send('❌ Invalid URL. Must start with http:// or https://');
  }

  const timestamp = Date.now().toString();
  const tempDir = path.join('/tmp', 'downloads', timestamp); // /tmp is writable on Vercel
  await fs.ensureDir(tempDir);

  const imageDir = path.join(tempDir, 'images');
  const cssDir = path.join(tempDir, 'css');
  const jsDir = path.join(tempDir, 'js');
  await fs.ensureDir(imageDir);
  await fs.ensureDir(cssDir);
  await fs.ensureDir(jsDir);

  try {
    // 📦 Puppeteer setup
    let browser;
    let puppeteer;

    if (process.env.AWS_REGION || process.env.VERCEL) {
      // Vercel (serverless)
      const chromium = require('@sparticuz/chromium');
      puppeteer = require('puppeteer-core');

      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
      });
    } else {
      // Local
      puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const html = await page.content();
    fs.writeFileSync(path.join(tempDir, 'index.html'), html);

    const assets = await page.evaluate(() => {
      return {
        imgs: Array.from(document.querySelectorAll('img')).map(i => i.src),
        css: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href),
        js: Array.from(document.querySelectorAll('script[src]')).map(s => s.src),
      };
    });

    const downloadAsset = async (url, folder) => {
      try {
        const filename = path.basename(new URL(url).pathname || 'file');
        const outputPath = path.join(folder, filename);
        const { data } = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, data);
      } catch (err) {
        console.warn(`⚠️ Skipping asset: ${url}`);
      }
    };

    await Promise.all(assets.imgs.map(img => downloadAsset(img, imageDir)));
    await Promise.all(assets.css.map(css => downloadAsset(css, cssDir)));
    await Promise.all(assets.js.map(js => downloadAsset(js, jsDir)));

    await browser.close();

    const zipPath = path.join('/tmp', `${timestamp}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(tempDir, false);
    await archive.finalize();

    output.on('close', () => {
      res.download(zipPath, 'cloned-site.zip');
    });

  } catch (err) {
    console.error('❌ Server Error:', err);
    res.status(500).send('❌ Failed to clone the site.');
  }
});

module.exports = app;
module.exports.handler = serverless(app);
