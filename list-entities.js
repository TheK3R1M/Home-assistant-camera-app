const axios = require('axios');
require('dotenv').config();

const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

if (!HA_TOKEN || HA_TOKEN === 'token_buraya_yapistirilacak') {
	console.error('HATA: .env dosyasında geçerli bir HA_TOKEN bulunamadı.');
	console.error('Lütfen .env dosyasını açıp tokenınızı yapıştırın.');
	process.exit(1);
}

async function listEntities() {
	try {
		console.log(`Bağlanılıyor: ${HA_URL}...`);
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
		console.log(`KAMERALAR (${cameras.length} adet bulundu):`);
		cameras.forEach(c => console.log(` - ${c.entity_id} (${c.attributes.friendly_name || 'İsimsiz'})`));

		console.log('\n----------------------------------------');
		console.log(`KİLİTLER / ANAHTARLAR (${locks.length} adet bulundu):`);
		// Filter out some common clutter if needed, but showing all is safer
		locks.slice(0, 20).forEach(l => console.log(` - ${l.entity_id} (${l.attributes.friendly_name || 'İsimsiz'})`));
		if (locks.length > 20) console.log(`... ve ${locks.length - 20} tane daha.`);

		console.log('----------------------------------------\n');

	} catch (error) {
		console.error('HATA OLUŞTU:');
		if (error.response) {
			console.error(`Durum Kodu: ${error.response.status}`);
			console.error('Mesaj:', error.response.statusText);
		} else {
			console.error(error.message);
		}
		console.log('\nOlası Çözümler:');
		console.log('1. HA_URL doğru mu? (http://ev.local:8123)');
		console.log('2. Token doğru kopyalandı mı?');
		console.log('3. Home Assistant çalışıyor mu?');
	}
}

listEntities();
