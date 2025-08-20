// assets path changes in the HTML
const updateHtmlPaths = (htmlContent, tempDir) => {
  // Replace paths in the HTML to point to the correct local folder structure
  return htmlContent
    .replace(/src="\/assets\/(.*?)"/g, (match, filename) => {
      return `src="/js/${filename}"`; // Update JS path
    })
    .replace(/href="\/assets\/(.*?)"/g, (match, filename) => {
      return `href="/css/${filename}"`; // Update CSS path
    })
    .replace(/href="https:\/\/storage.googleapis.com\/contextalytic\/scalex_ai_logo.png"/g, (match) => {
      return `href="/images/scalex_ai_logo.png"`; // Update image path
    })
    .replace(/src="https:\/\/storage.googleapis.com\/contextalytic\/scalex_ai_logo.png"/g, (match) => {
      return `src="/images/scalex_ai_logo.png"`; // Update image path
    });
};

app.post('/api/clone', async (req, res) => {
  const targetUrl = req.body.url;
  if (!/^https?:\/\//.test(targetUrl)) {
    return res.status(400).send('❌ Invalid URL. Must start with http:// or https://');
  }

  const timestamp = Date.now().toString();
  const tempDir = path.join('/tmp', 'downloads', timestamp); // Use /tmp on Vercel
  await fs.ensureDir(tempDir);

  const imageDir = path.join(tempDir, 'images');
  const cssDir = path.join(tempDir, 'css');
  const jsDir = path.join(tempDir, 'js');
  await fs.ensureDir(imageDir);
  await fs.ensureDir(cssDir);
  await fs.ensureDir(jsDir);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const html = await page.content();

    // Update the paths in the HTML file to use local paths
    const updatedHtml = updateHtmlPaths(html, tempDir);

    // Save the updated HTML file
    fs.writeFileSync(path.join(tempDir, 'index.html'), updatedHtml);

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
      } catch {}
    };

    // Download the assets
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
    console.error('❌ Error:', err);
    res.status(500).send('❌ Failed to clone the site.');
  }
});
