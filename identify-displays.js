const { app, screen } = require('electron');

app.whenReady().then(() => {
  const displays = screen.getAllDisplays();
  console.log('--------------------------------------------------');
  console.log('DETECTED DISPLAYS:');
  displays.forEach((display, index) => {
    console.log(`\nDisplay #${index + 1}:`);
    console.log(`  ID: ${display.id}`);
    console.log(`  Bounds: x=${display.bounds.x}, y=${display.bounds.y}, w=${display.bounds.width}, h=${display.bounds.height}`);
    console.log(`  Primary: ${display.id === screen.getPrimaryDisplay().id}`);
  });
  console.log('--------------------------------------------------');
  app.quit();
});
