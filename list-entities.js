const axios = require('axios');
require('dotenv').config();

const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

if (!HA_TOKEN || HA_TOKEN === 'token_buraya_yapistirilacak') {
	console.error('ERROR: No valid HA_TOKEN found in your environment configuration.');
	console.error('Please open your config and paste your token.');
	process.exit(1);
}

async function listEntities() {
	try {
		console.log(`Connecting to: ${HA_URL}...`);
		const response = await axios.get(`${HA_URL}/api/states`, {
			headers: {
				'Authorization': `Bearer ${HA_TOKEN}`,
				'Content-Type': 'application/json'
			}
		});

		const entities = response.data;
		const cameras = entities.filter(e => e.entity_id.startsWith('camera.'));
		const locks = entities.filter(e => e.entity_id.startsWith('lock.') || e.entity_id.startsWith('switch.'));

		console.log('\n----------------------------------------');
		console.log(`CAMERAS (${cameras.length} found):`);
		cameras.forEach(c => console.log(` - ${c.entity_id} (${c.attributes.friendly_name || 'Unnamed'})`));

		console.log('\n----------------------------------------');
		console.log(`LOCKS / SWITCHES (${locks.length} found):`);
		// Filter out some common clutter if needed, but showing all is safer
		locks.slice(0, 20).forEach(l => console.log(` - ${l.entity_id} (${l.attributes.friendly_name || 'Unnamed'})`));
		if (locks.length > 20) console.log(`... and ${locks.length - 20} more.`);

		console.log('----------------------------------------\n');

	} catch (error) {
		console.error('ERROR OCCURRED:');
		if (error.response) {
			console.error(`Status Code: ${error.response.status}`);
			console.error('Message:', error.response.statusText);
		} else {
			console.error(error.message);
		}
		console.log('\nPossible Solutions:');
		console.log('1. Is HA_URL correct? (e.g. http://ev.local:8123)');
		console.log('2. Was the token copied correctly?');
		console.log('3. Is Home Assistant running?');
	}
}

listEntities();
