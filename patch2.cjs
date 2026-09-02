const fs = require('fs');
let code = fs.readFileSync('src/pages/Menu.tsx', 'utf8');

// Replace load function
code = code.replace(
  `  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [
      { data: catsData },
      { data: subCatsData },
      { data: itemsData },
      { data: variantsData },
      { data: addonsData },
      { data: linksData },
      { data: restData },
      { data: allAddonsData },
    ] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
      supabase.from('menu_sub_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
      supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
      supabase.from('menu_item_variants').select('*').order('sort_order'),
      supabase.from('menu_addons').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
      supabase.from('menu_item_addons').select('*'),
      supabase.from('restaurants').select('id, name').eq('id', restaurantId).single(),
      supabase.from('menu_addons').select('*').order('sort_order'),
    ]);
    if (catsData) setCategories(catsData as Category[]);
    if (subCatsData) setSubCategories(subCatsData as SubCategory[]);
    if (itemsData) setItems(itemsData as MenuItem[]);
    if (variantsData) setItemVariants(variantsData as MenuItemVariant[]);
    if (addonsData) setAddons(addonsData as MenuAddon[]);
    if (linksData) setItemAddonLinks(linksData as ItemAddonLink[]);
    if (restData) setRestaurantName((restData as any).name);
    if (allAddonsData && isSuperAdmin) {
      const rNameMap = new Map<string, string>(allRestaurants.map(r => [r.id, r.name]));
      setAddonRestaurantCluster(buildAddonRestaurantClusters(allAddonsData as AddonClusterRow[], rNameMap));
    }
    setLoading(false);
  }, [restaurantId, isSuperAdmin, allRestaurants]);`,
  `  const load = useCallback(async () => {
    if (!restaurantId && !showAllRestaurants) return;
    setLoading(true);

    if (showAllRestaurants && isSuperAdmin) {
      const [
        { data: catsData },
        { data: subCatsData },
        { data: itemsData },
        { data: variantsData },
        { data: addonsData },
        { data: linksData },
        { data: restData },
        { data: allAddonsData },
      ] = await Promise.all([
        supabase.from('menu_categories').select('*').order('sort_order'),
        supabase.from('menu_sub_categories').select('*').order('sort_order'),
        supabase.from('menu_items').select('*').order('sort_order'),
        supabase.from('menu_item_variants').select('*').order('sort_order'),
        supabase.from('menu_addons').select('*').order('sort_order'),
        supabase.from('menu_item_addons').select('*'),
        supabase.from('restaurants').select('id, name').order('name'),
        supabase.from('menu_addons').select('*').order('sort_order'),
      ]);

      if (catsData) setCategories(catsData as Category[]);
      if (subCatsData) setSubCategories(subCatsData as SubCategory[]);
      if (itemsData) setItems(itemsData as MenuItem[]);
      if (variantsData) setItemVariants(variantsData as MenuItemVariant[]);
      if (addonsData) setAddons(addonsData as MenuAddon[]);
      if (linksData) setItemAddonLinks(linksData as ItemAddonLink[]);
      
      const rlist = (restData as { id: string; name: string }[]) ?? [];
      setAllRestaurants((prev) => JSON.stringify(prev) === JSON.stringify(rlist) ? prev : rlist);
      const rmap: Record<string, string> = {};
      rlist.forEach(r => { rmap[r.id] = r.name; });
      setRestaurantMap(rmap);

      if (allAddonsData && isSuperAdmin) {
        const rNameMap = new Map<string, string>(rlist.map(r => [r.id, r.name]));
        setAddonRestaurantCluster(buildAddonRestaurantClusters(allAddonsData as AddonClusterRow[], rNameMap));
      }
    } else {
      const [
        { data: catsData },
        { data: subCatsData },
        { data: itemsData },
        { data: variantsData },
        { data: addonsData },
        { data: linksData },
        { data: restData },
        { data: allAddonsData },
      ] = await Promise.all([
        supabase.from('menu_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_sub_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_item_variants').select('*').order('sort_order'),
        supabase.from('menu_addons').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_item_addons').select('*'),
        supabase.from('restaurants').select('id, name').eq('id', restaurantId).single(),
        supabase.from('menu_addons').select('*').order('sort_order'),
      ]);

      if (catsData) setCategories(catsData as Category[]);
      if (subCatsData) setSubCategories(subCatsData as SubCategory[]);
      if (itemsData) setItems(itemsData as MenuItem[]);
      if (variantsData) setItemVariants(variantsData as MenuItemVariant[]);
      if (addonsData) setAddons(addonsData as MenuAddon[]);
      if (linksData) setItemAddonLinks(linksData as ItemAddonLink[]);
      if (restData) setRestaurantName((restData as any).name);
      
      if (allAddonsData && isSuperAdmin) {
        const rNameMap = new Map<string, string>(allRestaurants.map(r => [r.id, r.name]));
        setAddonRestaurantCluster(buildAddonRestaurantClusters(allAddonsData as AddonClusterRow[], rNameMap));
      }
    }
    
    setLoading(false);
  }, [restaurantId, isSuperAdmin, showAllRestaurants, allRestaurants]);`
);

// Replace the useEffect for showAllRestaurants
code = code.replace(
  `  // Load items for all restaurants when toggle is on
  useEffect(() => {
    if (!isSuperAdmin) return;
    if (showAllRestaurants) {
      (async () => {
        setLoading(true);
        const [
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
        if (itemAddonsData) setItemAddonLinks(itemAddonsData as MenuItemAddon[]);
        const rlist = (restData as { id: string; name: string }[]) ?? [];
        setAllRestaurants((prev) => JSON.stringify(prev) === JSON.stringify(rlist) ? prev : rlist);
        const rmap: Record<string, string> = {};
        rlist.forEach(r => { rmap[r.id] = r.name; });
        setRestaurantMap(rmap);
        setLoading(false);
      })();
    } else {
      void load();
    }
  }, [showAllRestaurants, isSuperAdmin, load]);`,
  `  // Load all data depending on toggle
  useEffect(() => {
    void load();
  }, [showAllRestaurants, load]);`
);

// Update saveCategory to use targetRestaurantId
code = code.replace(
  `  const saveCategory = async (form: Partial<Category>) => {
    if (!restaurantId) return;
    setIsSaving(true);
    const payload = { 
      name: form.name || "", 
      description: form.description || null, 
      sort_order: form.sort_order || 0, 
      is_active: form.is_active ?? true, 
      restaurant_id: restaurantId 
    };`,
  `  const saveCategory = async (form: Partial<Category>) => {
    if (!restaurantId) return;
    setIsSaving(true);
    const targetRestaurantId = (showAllRestaurants && restaurantFilterId !== 'all') ? restaurantFilterId : restaurantId;
    const payload = { 
      name: form.name || "", 
      description: form.description || null, 
      sort_order: form.sort_order || 0, 
      is_active: form.is_active ?? true, 
      restaurant_id: targetRestaurantId 
    };`
);

// Update saveSubCategory to use targetRestaurantId
code = code.replace(
  `  const saveSubCategory = async (form: Partial<SubCategory>) => {
    if (!restaurantId) return;
    setIsSaving(true);
    const payload = { 
      category_id: form.category_id, 
      name: form.name || "", 
      description: form.description || null, 
      sort_order: form.sort_order || 0, 
      is_active: form.is_active ?? true, 
      restaurant_id: restaurantId 
    };`,
  `  const saveSubCategory = async (form: Partial<SubCategory>) => {
    if (!restaurantId) return;
    setIsSaving(true);
    const targetRestaurantId = (showAllRestaurants && restaurantFilterId !== 'all') ? restaurantFilterId : restaurantId;
    const payload = { 
      category_id: form.category_id, 
      name: form.name || "", 
      description: form.description || null, 
      sort_order: form.sort_order || 0, 
      is_active: form.is_active ?? true, 
      restaurant_id: targetRestaurantId 
    };`
);

fs.writeFileSync('src/pages/Menu.tsx', code);
console.log('Patched Menu.tsx');
