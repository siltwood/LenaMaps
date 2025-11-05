const STORAGE_KEY = 'lenamaps_saved_routes';

export const getSavedRoutes = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
};

export const saveRoute = (routeData) => {
  try {
    const savedRoutes = getSavedRoutes();

    const newRoute = {
      id: Date.now().toString(),
      name: routeData.name || `Route ${new Date().toLocaleDateString()}`,
      locations: routeData.locations.filter(loc => loc !== null),
      modes: routeData.modes,
      // Save custom drawing state
      customDrawEnabled: routeData.customDrawEnabled || [],
      customPoints: routeData.customPoints || {},
      snapToRoads: routeData.snapToRoads || [],
      lockedSegments: routeData.lockedSegments || [],
      savedAt: new Date().toISOString(),
      description: routeData.description || ''
    };

    const updated = [newRoute, ...savedRoutes];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    return newRoute;
  } catch (error) {
    throw error;
  }
};

export const deleteRoute = (routeId) => {
  try {
    const savedRoutes = getSavedRoutes();
    const updated = savedRoutes.filter(route => route.id !== routeId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    return false;
  }
};

export const updateRouteName = (routeId, newName) => {
  try {
    const savedRoutes = getSavedRoutes();
    const updated = savedRoutes.map(route => 
      route.id === routeId ? { ...route, name: newName } : route
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    return false;
  }
};

export const loadRoute = (routeId) => {
  const savedRoutes = getSavedRoutes();
  return savedRoutes.find(route => route.id === routeId);
};