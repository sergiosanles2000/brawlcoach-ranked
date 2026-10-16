const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcPath = 'C:\\Users\\gamep\\.gemini\\antigravity\\brain\\a621e456-c850-412d-a291-4b814ecde758\\.user_uploaded\\media_1792192120929_cce467ee.jpg';

// Copy directly to frontend assets & public
fs.copyFileSync(srcPath, 'd:\\app\\brawlIA\\frontend\\src\\assets\\app-icon.jpg');
fs.copyFileSync(srcPath, 'd:\\app\\brawlIA\\frontend\\public\\app-icon.jpg');
console.log('Copied icon to frontend assets');
