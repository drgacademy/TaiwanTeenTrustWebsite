const URL = 'https://tpolpfulwsfqpghweasl.supabase.co';
const KEY = 'sb_publishable_grN4TNJpPS7xNBQeiStUmQ_WNc0u8_J';

async function queryTable(table) {
  try {
    const res = await fetch(`${URL}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`
      }
    });
    if (!res.ok) {
      console.log(`Failed to fetch ${table}: ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    console.log(`=== Table: ${table} ===`);
    console.log(JSON.stringify(data.map(d => ({ id: d.id, title: d.title, slug: d.slug, key: d.key, name: d.name })), null, 2));
  } catch (err) {
    console.error(`Error fetching ${table}:`, err);
  }
}

async function main() {
  await queryTable('projects');
  await queryTable('posts');
  await queryTable('site_content');
}

main();
