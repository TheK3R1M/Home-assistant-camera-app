const fs = require('fs');
const path = require('path');

const localPath = path.join(__dirname, 'icon_design_1779380256320.png');
const fallbackPath = 'C:\\Users\\Kerim\\.gemini\\antigravity-ide\\brain\\fa73518b-4a1b-4665-ae19-4f164dba01d0\\icon_design_1779380256320.png';
const destPath = path.join(__dirname, 'icon.png');

try {
	let sourcePath = '';
	if (fs.existsSync(localPath)) {
		sourcePath = localPath;
	} else if (fs.existsSync(fallbackPath)) {
		sourcePath = fallbackPath;
	}

	if (sourcePath) {
		fs.copyFileSync(sourcePath, destPath);
		console.log(`Premium icon copied successfully from: ${sourcePath} to ${destPath}`);
	} else {
		console.error('Premium source icon file not found in local workspace or brain path.');
	}
} catch (e) {
	console.error('Failed to copy icon:', e);
}

