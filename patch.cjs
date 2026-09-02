const fs = require('fs');
let code = fs.readFileSync('src/pages/Menu.tsx', 'utf8');

// Replace displayedItems to include others
code = code.replace(
  `  const displayedItems = showAllRestaurants
    ? items.filter((it) => restaurantFilterId === 'all' || it.restaurant_id === restaurantFilterId)
    : items;`,
  `  const displayedItems = showAllRestaurants
    ? items.filter((it) => restaurantFilterId === 'all' || it.restaurant_id === restaurantFilterId)
    : items;
  const displayedCategories = showAllRestaurants
    ? categories.filter((c) => restaurantFilterId === 'all' || c.restaurant_id === restaurantFilterId)
    : categories;
  const displayedSubCategories = showAllRestaurants
    ? subCategories.filter((sc) => restaurantFilterId === 'all' || sc.restaurant_id === restaurantFilterId)
    : subCategories;
  const displayedAddons = showAllRestaurants
    ? addons.filter((a) => restaurantFilterId === 'all' || a.restaurant_id === restaurantFilterId)
    : addons;`
);

// Replace useEffect
code = code.replace(
  `        const [{ data: itemsData, error: itemsErr }, { data: restData, error: restErr }] = await Promise.all([
          supabase.from('menu_items').select('*').order('sort_order'),
          supabase.from('restaurants').select('id, name').order('name'),
        ]);
        if (itemsErr) console.error(itemsErr);
        if (restErr) console.error(restErr);
        if (itemsData) setItems(itemsData as MenuItem[]);`,
  `        const [
          { data: itemsData, error: itemsErr },
          { data: restData, error: restErr },
          { data: catsData },
          { data: subCatsData },
          { data: addonsData },
          { data: itemAddonsData }
        ] = await Promise.all([
          supabase.from('menu_items').select('*').order('sort_order'),
          supabase.from('restaurants').select('id, name').order('name'),
          supabase.from('menu_categories').select('*').order('sort_order'),
          supabase.from('menu_sub_categories').select('*').order('sort_order'),
          supabase.from('menu_addons').select('*').order('sort_order'),
          supabase.from('menu_item_addons').select('*'),
        ]);
        if (itemsErr) console.error(itemsErr);
        if (restErr) console.error(restErr);
        if (itemsData) setItems(itemsData as MenuItem[]);
        if (catsData) setCategories(catsData as Category[]);
        if (subCatsData) setSubCategories(subCatsData as SubCategory[]);
        if (addonsData) setAddons(addonsData as MenuAddon[]);
        if (itemAddonsData) setItemAddonLinks(itemAddonsData as MenuItemAddon[]);`
);

// Replace categories.map in tables
code = code.replace('{categories.map((cat) => (\\n                    <tr key={cat.id}', '{displayedCategories.map((cat) => (\\n                    <tr key={cat.id}');
code = code.replace('{categories.map((cat) => {\\n            const catItems', '{displayedCategories.map((cat) => {\\n            const catItems');

// Replace subCategories.map
code = code.replace('{subCategories.map((sc) => (\\n                    <tr key={sc.id}', '{displayedSubCategories.map((sc) => (\\n                    <tr key={sc.id}');

// Replace addons.map
code = code.replace('{addons.map((ad) => (\\n                    <tr key={ad.id}', '{displayedAddons.map((ad) => (\\n                    <tr key={ad.id}');
code = code.replace('{addons.map((ad) => {\\n                    const rests', '{displayedAddons.map((ad) => {\\n                    const rests');

fs.writeFileSync('src/pages/Menu.tsx', code);
console.log('Patched');
