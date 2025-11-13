const STORAGE_KEY = 'lenamaps_saved_routes';
const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds (Google ToS compliant)

export const getSavedRoutes = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    const routes = JSON.parse(saved);
    const now = Date.now();

    // Filter out expired routes (Google ToS: coordinates can only be cached for 30 days)
    const validRoutes = routes.filter(route => {
      if (!route.expiresAt) {
        // Old routes without expiration - mark as expired
        return false;
      }
      return now < route.expiresAt;
    });

    // If any routes were expired, update storage
    if (validRoutes.length !== routes.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validRoutes));
    }

    return validRoutes;
  } catch (error) {
    return [];
  }
};

export const saveRoute = (routeData) => {
  try {
    const savedRoutes = getSavedRoutes();
    const now = Date.now();

    const newRoute = {
      id: now.toString(),
      name: routeData.name || `Route ${new Date().toLocaleDateString()}`,
      locations: routeData.locations.filter(loc => loc !== null),
      modes: routeData.modes,
      // Save custom drawing state
      customDrawEnabled: routeData.customDrawEnabled || [],
      customPoints: routeData.customPoints || {},
      snapToRoads: routeData.snapToRoads || [],
      lockedSegments: routeData.lockedSegments || [],
      savedAt: new Date().toISOString(),
      description: routeData.description || '',
      // Add expiration timestamp (30 days from now - Google ToS compliant)
      expiresAt: now + MAX_CACHE_AGE
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