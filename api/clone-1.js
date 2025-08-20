const fs = require('fs-extra');
const axios = require('axios');
const path = require('path');
const { URL } = require('url');

// Helper function to download assets
const downloadAsset = async (assetUrl, baseUrl, targetFolder) => {
  try {
    const parsedUrl = new URL(assetUrl, baseUrl); // Resolve relative URL against the base URL
    const assetPath = parsedUrl.pathname;  // Get the path part of the URL
    const localPath = path.join(targetFolder, assetPath); // Build the local path
    const dir = path.dirname(localPath); // Get directory path

    // Ensure the directory exists before saving the file
    await fs.ensureDir(dir);
    
    // Download the asset data
    const { data } = await axios.get(assetUrl, { responseType: 'arraybuffer' });
    // Save the file locally
    fs.writeFileSync(localPath, data);
    
    return localPath;  // Return the local path of the saved asset
  } catch (error) {
    console.error(`Error downloading asset ${assetUrl}:`, error);
  }
};

// Helper function to update asset paths in HTML
const updateAssetPathsInHTML = (html, localPaths, targetFolder) => {
  localPaths.forEach((localPath) => {
    const relativePath = path.relative(path.join(targetFolder, 'assets'), localPath).replace(/\\/g, '/');
    const assetUrl = '/assets/' + relativePath;  // Generate URL for local assets
    const regex = new RegExp(`"${localPath.replace(/\\/g, '\\\\')}"`, 'g');
    html = html.replace(regex, assetUrl);  // Replace old asset path with local path
  });
  return html;
};

// Main function to clone assets and update HTML
const cloneSiteAssets = async (baseUrl, htmlContent) => {
  // Extract all asset URLs (CSS, JS, Images) from the HTML content
  const assetUrls = [];

  // Regex to capture JS, CSS, and image URLs
  const jsUrls = Array.from(htmlContent.matchAll(/<script.*?src="(.*?)"/g)).map((match) => match[1]);
  const cssUrls = Array.from(htmlContent.matchAll(/<link.*?href="(.*?)"/g)).map((match) => match[1]);
  const imgUrls = Array.from(htmlContent.matchAll(/<img.*?src="(.*?)"/g)).map((match) => match[1]);

  // Combine all asset URLs (CSS, JS, Images)
  assetUrls.push(...jsUrls, ...cssUrls, ...imgUrls);

  // Filter out any external URLs (only process local URLs)
  const localAssetUrls = assetUrls.filter((assetUrl) => !assetUrl.startsWith('http'));

  // Define the target folder for assets
  const assetsDir = path.join(__dirname, 'assets'); // Base folder where assets will be saved locally

  // Download each asset and save it in the appropriate folder
  const localPaths = [];
  for (const assetUrl of localAssetUrls) {
    const localPath = await downloadAsset(assetUrl, baseUrl, assetsDir); // Use baseUrl to resolve relative paths
    if (localPath) localPaths.push(localPath);
  }

  // Update the HTML content to reference the new local paths
  let updatedHtml = htmlContent;
  updatedHtml = updateAssetPathsInHTML(updatedHtml, localPaths, __dirname);

  return updatedHtml;
};

// Example usage (with the URL of the website and the HTML content):
const cloneSite = async () => {
  const targetUrl = 'https://example.com'; // The base URL of the site you're cloning
  const htmlContent = await axios.get(targetUrl).then(res => res.data); // Fetch HTML content of the page

  // Now clone assets and update HTML
  const updatedHtml = await cloneSiteAssets(targetUrl, htmlContent);

  // Save updated HTML to file
  fs.writeFileSync(path.join(__dirname, 'cloned_index.html'), updatedHtml);

  console.log('Assets cloned and HTML updated successfully!');
};

cloneSite();
