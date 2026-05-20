const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const version = '30.5.1';
const filename = `electron-v${version}-win32-x64.zip`;
const cacheDir = path.join('/Users/yiliwen/Library/Caches/electron');
const destPath = path.join(cacheDir, filename);

// Try HTTP first to bypass SSL/TLS decryption blocks
const urls = [
  `http://cdn.npmmirror.com/binaries/electron/v${version}/${filename}`,
  `http://npmmirror.com/mirrors/electron/v${version}/${filename}`,
  `https://cdn.npmmirror.com/binaries/electron/v${version}/${filename}`,
  `https://npmmirror.com/mirrors/electron/v${version}/${filename}`
];

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

function download(urlIndex = 0) {
  if (urlIndex >= urls.length) {
    console.error('❌ All download URLs failed.');
    process.exit(1);
  }
  
  const url = urls[urlIndex];
  console.log(`📥 Downloading from: ${url}`);
  console.log(`   To: ${destPath}`);
  
  const file = fs.createWriteStream(destPath);
  const client = url.startsWith('https') ? https : http;
  
  const request = client.get(url, { rejectUnauthorized: false }, (response) => {
    // Handle redirects
    if (response.statusCode === 301 || response.statusCode === 302) {
      const redirectUrl = response.headers.location;
      console.log(`   -> Redirected to: ${redirectUrl}`);
      file.close();
      fs.unlinkSync(destPath); // delete empty file
      
      const redirectClient = redirectUrl.startsWith('https') ? https : http;
      const redirectReq = redirectClient.get(redirectUrl, { rejectUnauthorized: false }, (redirectRes) => {
        const finalFile = fs.createWriteStream(destPath);
        redirectRes.pipe(finalFile);
        finalFile.on('finish', () => {
          finalFile.close();
          console.log('🎉 Download completed successfully via redirect!');
          process.exit(0);
        });
      });
      
      redirectReq.on('error', (err) => {
        console.error(`   ⚠️ Redirect download error: ${err.message}`);
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        download(urlIndex + 1);
      });
      return;
    }
    
    if (response.statusCode !== 200) {
      console.error(`   ⚠️ Server responded with status code: ${response.statusCode}`);
      file.close();
      fs.unlinkSync(destPath);
      download(urlIndex + 1);
      return;
    }
    
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('🎉 Download completed successfully!');
      process.exit(0);
    });
  });
  
  request.on('error', (err) => {
    console.error(`   ⚠️ Download error: ${err.message}`);
    file.close();
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    download(urlIndex + 1);
  });
}

download(0);
