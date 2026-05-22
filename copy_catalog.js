const fs = require('fs');
try {
  fs.copyFileSync('C:\\Users\\Kerim\\.gemini\\antigravity\\TUM_YETENEKLER_KATALOGU.md', '.\\TUM_YETENEKLER_KATALOGU.md');
  console.log('Success');
} catch (e) {
  console.error(e);
}
