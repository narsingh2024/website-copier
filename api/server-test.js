const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/clone', async (req, res) => {
  const targetUrl = req.body.url;
  if (!/^https?:\/\//.test(targetUrl)) {
    return res.send('❌ Invalid URL. Must start with http:// or https://');
  }

  const timestamp = Date.now().toString();
  const downloadDir = path.join(__dirname, 'downloads');
  const sessionDir = path.join(downloadDir, timestamp);
  await fs.ensureDir(sessionDir);

  const imageDir = path.join(sessionDir, 'images');
  const cssDir = path.join(sessionDir, 'css');
  const jsDir = path.join(sessionDir, 'js');
  await fs.ensureDir(imageDir);
  await fs.ensureDir(cssDir);
  await fs.ensureDir(jsDir);

  try {
    console.log(`🟡 Cloning: ${targetUrl}`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const html = await page.content();
    fs.writeFileSync(path.join(sessionDir, 'index.html'), html);

    const assets = await page.evaluate(() => {
      return {
        imgs: Array.from(document.querySelectorAll('img')).map(i => i.src),
        css: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href),
        js: Array.from(document.querySelectorAll('script[src]')).map(s => s.src),
      };
    });

    const downloadAsset = async (url, folder) => {
      try {
        const filename = path.basename(new URL(url).pathname);
        const outputPath = path.join(folder, filename);
        const { data } = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, data);
        console.log(`✅ Downloaded: ${url}`);
      } catch (err) {
        console.warn(`⚠️ Failed: ${url}`);
      }
    };

    for (let img of assets.imgs) {
      if (img) await downloadAsset(img, imageDir);
    }
    for (let css of assets.css) {
      if (css) await downloadAsset(css, cssDir);
    }
    for (let js of assets.js) {
      if (js) await downloadAsset(js, jsDir);
    }

    await browser.close();

    const zipPath = path.join(downloadDir, `${timestamp}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(sessionDir, false);
    await archive.finalize();

    output.on('close', () => {
      console.log(`📦 Ready to download: ${zipPath}`);
      res.download(zipPath, 'cloned-site.zip');
    });

  } catch (err) {
    console.error('❌ Error:', err);
    res.send('❌ Failed to clone the site. Check server logs.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running: http://localhost:${PORT}`);
});
