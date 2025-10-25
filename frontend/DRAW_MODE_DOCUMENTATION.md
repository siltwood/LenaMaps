# DRAW MODE - COMPLETE TECHNICAL DOCUMENTATION

This document provides a comprehensive step-by-step breakdown of how the custom route drawing feature works in LenaMaps, with exact code citations.

## Table of Contents
- [State Management](#state-management)
- [Phase 1: Initialization & Toggle](#phase-1-initialization--toggle)
- [Phase 2: Click Handling & Point Addition](#phase-2-click-handling--point-addition)
- [Phase 3: Polyline Rendering](#phase-3-polyline-rendering)
- [Phase 4: Locking & State Transitions](#phase-4-locking--state-transitions)
- [Phase 5: Edge Cases & Map Click Blocking](#phase-5-edge-cases--map-click-blocking)
- [Complete Data Flow Summary](#complete-data-flow-summary)

---

## State Management (Source of Truth)

All state is managed in `DirectionsPanel/index.jsx`:

### Core State Arrays (lines 48-53)
```javascript
const [locations, setLocations] = useState(propsLocations);
const [legModes, setLegModes] = useState(propsLegModes);
const [customDrawEnabled, setCustomDrawEnabled] = useState([]);
const [lockedSegments, setLockedSegments] = useState([]);
const [customPoints, setCustomPoints] = useState({});
const [snapToRoads, setSnapToRoads] = useState([]);
```

**State descriptions:**
- `locations` - Array of marker positions `[{lat, lng, name, address}, ...]`
- `legModes` - Transportation mode for each segment `['walk', 'transit', ...]`
- `customDrawEnabled` - Boolean array indicating which segments are in draw mode `[false, true, ...]`
- `lockedSegments` - Boolean array indicating which segments are locked `[false, true, ...]`
- `customPoints` - Object mapping segment index to array of custom waypoints `{1: [{lat, lng}, ...]}`
- `snapToRoads` - Boolean array for snap-to-roads feature (currently unused in UI)

### Derived State (lines 160-181)
```javascript
const routeSegments = React.useMemo(() => {
  const segments = [];
  for (let i = 0; i < locations.length - 1; i++) {
    if (locations[i] === null && locations[i + 1] === null && !customDrawEnabled[i]) {
      continue;
    }
    segments.push({
      id: `seg-${i}`,
      startLocation: locations[i],
      endLocation: locations[i + 1],
      mode: legModes[i] || 'walk',
      isCustom: customDrawEnabled[i] === true,  // Line 171
      isLocked: lockedSegments[i] === true,     // Line 172
      snapToRoads: snapToRoads[i] === true,
      customPoints: customPoints[i] || []       // Line 174
    });
  }
  return segments;
}, [locations, legModes, customDrawEnabled, lockedSegments, snapToRoads, customPoints]);
```

**What it does:**
- Combines all state arrays into single unified segment objects
- This is the "single source of truth" passed to all child components
- Rebuilds whenever any state array changes
- **Line 171**: Sets `isCustom` flag from `customDrawEnabled[i]`
- **Line 172**: Sets `isLocked` flag from `lockedSegments[i]`
- **Line 174**: Includes custom points array

---

## PHASE 1: INITIALIZATION & TOGGLE

### Step 1.1: User Clicks "Draw Custom Route" Toggle

**File:** `DirectionsPanel/index.jsx`

**UI Element (lines 1330-1344):**
```javascript
<label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
  <input
    type="checkbox"
    checked={routeSegments[index]?.isCustom || false}
    disabled={routeSegments[index]?.isLocked}
    onChange={() => toggleSegmentDrawMode(index)}
    style={{ cursor: routeSegments[index]?.isLocked ? 'not-allowed' : 'pointer' }}
  />
  <span>
    Draw Custom Route
    {routeSegments[index]?.isLocked && ' (Locked)'}
  </span>
</label>
```

**What happens:**
- Checkbox is checked/unchecked
- `onChange` calls `toggleSegmentDrawMode(index)`
- If locked, checkbox is disabled

---

### Step 1.2: Toggle Function Executes

**File:** `DirectionsPanel/index.jsx`
**Function:** `toggleSegmentDrawMode` **(lines 339-393)**

```javascript
const toggleSegmentDrawMode = useCallback((segmentIndex) => {
  console.log('🆕 TOGGLE DRAW MODE:', segmentIndex);
  console.log('  Current locations:', locations);

  // Save to undo history BEFORE changing
  saveToUndoHistory('TOGGLE_DRAW_MODE'); // Line 344

  setCustomDrawEnabled(prev => {
    const newArr = [...prev];
    const newIsCustom = !newArr[segmentIndex]; // Line 348 - flip boolean
    newArr[segmentIndex] = newIsCustom;

    console.log('  Setting customDrawEnabled[', segmentIndex, '] =', newIsCustom);
```

**Key Logic:**
1. **Line 344**: Saves current state to undo history
2. **Line 348**: Flips the boolean `customDrawEnabled[segmentIndex]`

---

### Step 1.3: Initialize customPoints Based on Existing Locations

**Still in toggleSegmentDrawMode (lines 353-378):**

**Case A: Both locations exist (toggling ON after toggling OFF)**
```javascript
if (newIsCustom && locations[segmentIndex] && locations[segmentIndex + 1]) {
  console.log('  Enabling draw mode - creating straight line (both locations exist)');
  setCustomPoints(prevPoints => ({
    ...prevPoints,
    [segmentIndex]: [
      { lat: locations[segmentIndex].lat, lng: locations[segmentIndex].lng },
      { lat: locations[segmentIndex + 1].lat, lng: locations[segmentIndex + 1].lng }
    ]
  }));
}
```
- Creates 2-point array: [start, end]
- Renders as straight line

**Case B: Only start location exists**
```javascript
else if (newIsCustom && locations[segmentIndex]) {
  console.log('  Enabling draw mode - only start location exists, preserving it');
  setCustomPoints(prevPoints => ({
    ...prevPoints,
    [segmentIndex]: [
      { lat: locations[segmentIndex].lat, lng: locations[segmentIndex].lng }
    ]
  }));
}
```
- Creates 1-point array: [start]
- Ready for user to add more points

**Case C: No locations exist**
```javascript
else if (newIsCustom) {
  console.log('  Enabling draw mode - no locations yet, will draw from scratch');
  setCustomPoints(prevPoints => ({
    ...prevPoints,
    [segmentIndex]: []
  }));
}
```
- Creates empty array
- First click will set start location

**Case D: Toggling OFF (disabling draw mode)**
```javascript
if (!newIsCustom) {
  console.log('  Disabling draw mode - clearing points but keeping end location');
  setCustomPoints(prevPoints => {
    const newPoints = { ...prevPoints };
    delete newPoints[segmentIndex];
    return newPoints;
  });
}
```
- Deletes customPoints for this segment
- **Keeps both start and end locations**
- Google will recalculate route between them

---

### Step 1.4: CustomRouteDrawer Component Renders

**File:** `DirectionsPanel/index.jsx`
**Render loop (lines 1413-1433):**

```javascript
{map && routeSegments.map((segment, index) => {
  if (!segment.isCustom) return null; // Only render if drawing is enabled

  console.log(`CustomRouteDrawer ${index}: isCustom=${segment.isCustom}, isLocked=${segment.isLocked}, points=${segment.customPoints.length}`);

  return (
    <CustomRouteDrawer
      key={`drawer-${index}`}
      map={map}
      segmentIndex={index}
      isEnabled={!segment.isLocked}           // Line 1424
      snapToRoads={segment.snapToRoads || false}
      mode={segment.mode || 'walk'}
      onPointAdded={handlePointAdded}
      onSetLocations={handleSetLocations}
      previousLocation={index > 0 ? segment.startLocation : null}
      points={segment.customPoints || []}    // Line 1430
    />
  );
})}
```

**Key props:**
- **Line 1424**: `isEnabled={!segment.isLocked}` - enables/disables clicking
- **Line 1430**: `points={segment.customPoints || []}` - passes points array

---

## PHASE 2: CLICK HANDLING & POINT ADDITION

### Step 2.1: CustomRouteDrawer Sets Up Click Listener

**File:** `CustomRouteDrawer.jsx`
**useEffect (lines 177-204):**

```javascript
useEffect(() => {
  if (!map || !isEnabled) {  // Line 178 - only setup if enabled
    // Clean up
    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    // Reset cursor
    if (map) {
      map.setOptions({
        draggableCursor: null,
        draggingCursor: null
      });
    }
    return;
  }

  // Set crosshair cursor for drawing mode
  map.setOptions({
    draggableCursor: 'crosshair',  // Line 196
    draggingCursor: 'crosshair'
  });

  // Add click listener
  clickListenerRef.current = map.addListener('click', handleClick); // Line 202

  return () => {
    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
    }
  };
}, [map, isEnabled, handleClick]);
```

**What it does:**
- **Line 178**: Only runs if `map` exists AND `isEnabled=true`
- **Line 196**: Sets crosshair cursor
- **Line 202**: Adds click listener that calls `handleClick`

---

### Step 2.2: User Clicks Map

**Map click event fires → calls `handleClick`**

---

### Step 2.3: handleClick Processes the Click

**File:** `CustomRouteDrawer.jsx`
**Function:** `handleClick` **(lines 129-174)**

```javascript
const handleClick = useCallback(async (event) => {
  if (!isEnabled) return; // Safety check

  console.log('CUSTOM ROUTE DRAWER CLICK:');
  console.log('  Segment index:', segmentIndex);
  console.log('  isEnabled:', isEnabled);
  console.log('  Current points count:', points.length);

  // Get the clicked location
  const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
  console.log('  Adding point:', point);

  // Notify parent to add this point
  if (onPointAdded) {
    onPointAdded({
      segmentIndex,
      point,
      snapped: snapToRoads
    });
  }

  // AUTO-SET LOCATIONS: First point = start, Last point = end
  if (onSetLocations) {
    const allPoints = [...points, point]; // Line 151 - includes new point
    console.log('  AUTO-SET LOCATIONS logic:');
    console.log('    allPoints length:', allPoints.length);
    console.log('    segmentIndex:', segmentIndex);

    if (segmentIndex === 0) {
      // First segment (A→B): set start on first click, end on subsequent clicks
      if (allPoints.length === 1) {
        // First click - set only A
        console.log('    First click - setting only A');
        onSetLocations(segmentIndex, point, null); // Line 161
      } else {
        // Second+ clicks - update B, keep A
        console.log('    Subsequent click - updating only B');
        onSetLocations(segmentIndex, null, point); // Line 165
      }
    } else {
      // Later segments (B→C, C→D, etc.): only update the end point
      // Start point already exists from previous segment
      console.log('    Later segment - updating only end point');
      onSetLocations(segmentIndex, null, point); // Line 171
    }
  }
}, [isEnabled, segmentIndex, points, snapToRoads, onPointAdded, onSetLocations]);
```

**What it does:**
1. **Line 130**: Safety check - exit if not enabled
2. **Line 138**: Creates point object from click coordinates
3. **Lines 141-147**: Calls `onPointAdded` callback with segment index and point
4. **Lines 149-174**: Auto-updates start/end locations based on segment index

**Auto-location logic:**
- **Segment 0 (A→B):**
  - First click: Sets `locations[0]` (start marker A)
  - Subsequent clicks: Updates `locations[1]` (end marker B) dynamically

- **Later segments (B→C, C→D):**
  - **Line 171**: Every click updates end location
  - Start is already set from previous segment
  - End marker moves with each click (dynamic!)

---

### Step 2.4: onPointAdded Callback Goes to DirectionsPanel

**File:** `DirectionsPanel/index.jsx`
**Function:** `handlePointAdded` **(lines 881-889)**

```javascript
const handlePointAdded = useCallback(({ segmentIndex, point, snapped }) => {
  console.log('🆕 HANDLE POINT ADDED (via segments):', segmentIndex, point);

  // Call the original addPointToSegment
  addPointToSegment(segmentIndex, point);

  // Note: CustomRouteDrawer now handles setting locations via handleSetLocations
  // We don't need to duplicate that logic here
}, [addPointToSegment]);
```

**What it does:**
- Receives point from CustomRouteDrawer
- Calls `addPointToSegment(segmentIndex, point)`

---

### Step 2.5: Point Added to State

**File:** `DirectionsPanel/index.jsx`
**Function:** `addPointToSegment` **(lines 399-414)**

```javascript
const addPointToSegment = useCallback((segmentIndex, point) => {
  console.log('🆕 ADD POINT TO SEGMENT:', segmentIndex, point);

  // Save to undo history BEFORE changing
  saveToUndoHistory('ADD_POINT'); // Line 402

  setCustomPoints(prevPoints => {
    const newPoints = { ...prevPoints };
    const currentPoints = newPoints[segmentIndex] || [];
    newPoints[segmentIndex] = [...currentPoints, point]; // Line 407 - append point
    console.log('  Updated customPoints:', newPoints);
    return newPoints;
  });
}, [saveToUndoHistory]);
```

**What it does:**
1. **Line 402**: Saves to undo history
2. **Line 407**: Appends new point to `customPoints[segmentIndex]` array
3. This triggers `routeSegments` useMemo to rebuild

---

### Step 2.6: handleSetLocations Updates Location State

**File:** `DirectionsPanel/index.jsx`
**Function:** `handleSetLocations` **(lines 935-965)**

```javascript
const handleSetLocations = useCallback((segmentIndex, startPoint, endPoint) => {
  console.log('HANDLE SET LOCATIONS:');
  console.log('  Segment index:', segmentIndex);
  console.log('  Start point:', startPoint);
  console.log('  End point:', endPoint);
  console.log('  Current locations before:', locations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));

  setLocations(prevLocations => {
    const newLocations = [...prevLocations];

    // Update start location if provided
    if (startPoint) {
      newLocations[segmentIndex] = startPoint; // Line 948
    }

    // Update end location if provided
    if (endPoint) {
      newLocations[segmentIndex + 1] = endPoint; // Line 953
    }

    console.log('  New locations after:', newLocations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));
    return newLocations;
  });
}, [locations]);
```

**What it does:**
- **Line 948**: Updates start location if provided
- **Line 953**: Updates end location if provided
- **For draw mode**: Usually only `endPoint` is provided
- This makes the end marker dynamic - it moves with each click

---

## PHASE 3: POLYLINE RENDERING

### Step 3.1: CustomRouteDrawer Renders Polyline

**File:** `CustomRouteDrawer.jsx`
**useEffect (lines 40-110):**

```javascript
// Render polyline and point markers from points array
useEffect(() => {
  if (!map) {  // Line 41 - CRITICAL: Only check for map, not isEnabled
    // Clean up if no map
    if (mainPolylineRef.current) {
      mainPolylineRef.current.setMap(null);
      mainPolylineRef.current = null;
    }
    clearPointMarkers();
    return;
  }

  // Build path - start with previousLocation if this is a continuation (B→C)
  const pathPoints = [];
  if (previousLocation && segmentIndex > 0) {
    pathPoints.push({ lat: previousLocation.lat, lng: previousLocation.lng }); // Line 54
  }
  pathPoints.push(...points); // Line 56 - add all custom points

  // Update or create polyline (render even when locked/disabled)
  if (pathPoints.length >= 2) {  // Line 59 - need at least 2 points
    if (!mainPolylineRef.current) {
      mainPolylineRef.current = new window.google.maps.Polyline({
        path: pathPoints,
        geodesic: true,
        strokeColor: strokeColor,
        strokeOpacity: 1.0,
        strokeWeight: 4,
        map: map,
        zIndex: 5000 // Higher zIndex to stay above animation polyline
      });
    } else {
      mainPolylineRef.current.setPath(pathPoints); // Line 71 - update existing
    }
  } else if (mainPolylineRef.current) {
    mainPolylineRef.current.setMap(null);
    mainPolylineRef.current = null;
  }

  // Clear old markers
  clearPointMarkers(); // Line 79

  // Add point markers for each clicked point (not previousLocation)
  // Only show point markers when NOT locked (when isEnabled is true)
  if (isEnabled) {  // Line 83 - ONLY render markers if unlocked
    points.forEach((point, idx) => {
      const marker = new window.google.maps.Marker({
        position: point,
        map: map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: strokeColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        },
        zIndex: 3000 + idx,
        draggable: false
      });
      pointMarkersRef.current.push(marker);
    });
  }

  return () => {
    if (mainPolylineRef.current) {
      mainPolylineRef.current.setMap(null);
      mainPolylineRef.current = null;
    }
    clearPointMarkers();
  };
}, [map, isEnabled, points, previousLocation, strokeColor, segmentIndex]);
```

**Critical logic:**
- **Line 41**: Only checks `if (!map)`, NOT `if (!map || !isEnabled)`
  - **This is the fix!** Polyline renders even when segment is locked
- **Line 54**: Includes `previousLocation` (segment start) if not first segment
- **Line 56**: Spreads all custom points
- **Line 59**: Only renders if 2+ points total
- **Line 71**: Updates path when points change
- **Line 83**: Only renders point markers when `isEnabled=true` (unlocked)

**Result:**
- Locked segments show polyline but not waypoint dots
- Unlocked segments show both polyline and waypoint dots

---

### Step 3.2: RouteSegmentManager Renders Segment Markers

**File:** `RouteSegmentManager.jsx`
**Custom segment rendering (lines 677-732):**

```javascript
if (isCustomSegment) {
  console.log(`  Segment ${i} is custom - clearing any existing calculated route and rendering markers only`);

  // If there's an existing non-custom segment at this index, clear it first
  if (segmentsRef.current[i] && !segmentsRef.current[i].isCustom) {
    console.log(`  Clearing old calculated route at segment ${i}`);
    clearSegment(segmentsRef.current[i]);
  }

  // Custom segment - render markers only (CustomRouteDrawer handles the polyline)
  const markers = {};
  const modeIcon = TRANSPORT_ICONS[segmentMode] || '🚶';
  const modeColor = getTransportationColor(segmentMode);

  // Add start marker (only for first segment)
  if (i === 0) {  // Line 692
    console.log(`  Creating START marker for custom segment ${i}`);
    markers.start = createMarker(
      segmentOrigin,
      modeIcon,
      modeColor,
      'Start',
      5000,
      false
    );
  }

  // Add end marker (only for last segment)
  if (i === validLocations.length - 2) {  // Line 705
    console.log(`  Creating END marker for custom segment ${i}`);
    markers.end = createMarker(
      segmentDestination,
      modeIcon,
      modeColor,
      'End',
      5001,
      false
    );
  }

  // Add waypoint marker for intermediate points (not first, not last)
  if (i > 0 && i < validLocations.length - 2) {  // Line 718
    console.log(`  Creating WAYPOINT marker for custom segment ${i}`);
    markers.waypoint = createMarker(
      segmentDestination,
      modeIcon,
      modeColor,
      `Waypoint ${i + 1}`,
      4000 + i,
      false
    );
  }

  // Store custom segment reference
  segmentsRef.current[i] = {
    id: `seg-${i}`,
    isCustom: true,
    markers: markers
  };

  continue; // Skip to next segment
}
```

**What it does:**
- **Line 692**: Creates START marker (only for segment 0)
- **Line 705**: Creates END marker (only for last segment)
- **Line 718**: Creates WAYPOINT marker (for middle segments)
- **Does NOT create DirectionsRenderer** - polyline handled by CustomRouteDrawer

---

## PHASE 4: LOCKING & STATE TRANSITIONS

### Step 4.1: User Clicks "Add Location" Button

**File:** `DirectionsPanel/index.jsx`
**UI Button (around lines 1367-1380):**

```javascript
<button
  onClick={addNextLegToSegments}
  className="add-leg-btn"
  disabled={!allFilledLocations.every(loc => loc !== null)}
>
  + Add Location
</button>
```

**What it does:**
- Button is disabled if any current locations are null
- Calls `addNextLegToSegments()` when clicked

---

### Step 4.2: Lock Check & Execution

**File:** `DirectionsPanel/index.jsx`
**Function:** `addNextLegToSegments` **(lines 262-294)**

```javascript
const addNextLegToSegments = useCallback(() => {
  console.log('🆕 ADD NEXT LEG (via old function)');

  // Save to undo history BEFORE changing
  saveToUndoHistory('ADD_DESTINATION'); // Line 266

  // Clear active input - user is adding a new leg, not editing
  setActiveInput(null); // Line 269

  // Lock the last segment if it's in custom draw mode
  const lastSegmentIndex = locations.length - 2; // Line 272
  if (lastSegmentIndex >= 0 && customDrawEnabled[lastSegmentIndex]) { // Line 273
    console.log('  Locking segment', lastSegmentIndex, 'since moving to next segment');
    const newLockedSegments = [...lockedSegments];
    newLockedSegments[lastSegmentIndex] = true; // Line 276 - LOCK IT
    setLockedSegments(newLockedSegments);
  }

  // Add new location and mode
  const newLocations = [...locations, null]; // Line 281
  const newModes = [...legModes, 'walk']; // Line 282

  setLocations(newLocations);
  setLegModes(newModes);

  // Notify parent via deprecated callbacks (will be removed later)
  if (onLocationsChange) {
    onLocationsChange(newLocations, 'ADD_DESTINATION');
  }
  if (onLegModesChange) {
    onLegModesChange(newModes);
  }
}, [locations, customDrawEnabled, lockedSegments, legModes, saveToUndoHistory, onLocationsChange, onLegModesChange]);
```

**Critical logic:**
- **Line 272**: Calculates last segment index: `locations.length - 2`
  - Example: If `locations = [A, B, C]`, then segments are [A→B, B→C]
  - Last segment index = 3 - 2 = 1 (segment B→C)
- **Line 273**: Checks if that segment has draw mode enabled
- **Line 276**: Sets `lockedSegments[lastSegmentIndex] = true`
- **Line 281**: Adds new null location (creating next segment)

---

### Step 4.3: State Rebuilds with Locked Flag

**File:** `DirectionsPanel/index.jsx`
**useMemo:** `routeSegments` **(line 172)**

```javascript
isLocked: lockedSegments[i] === true, // Line 172
```

**What happens:**
- `routeSegments[i].isLocked` is now `true`
- This triggers re-render of CustomRouteDrawer

---

### Step 4.4: CustomRouteDrawer Receives isEnabled=false

**File:** `DirectionsPanel/index.jsx`
**Render (line 1424):**

```javascript
isEnabled={!segment.isLocked}  // Line 1424
```

**What it does:**
- If `segment.isLocked = true`, then `isEnabled = false`
- CustomRouteDrawer receives `isEnabled={false}`

---

### Step 4.5: Click Listener Removed

**File:** `CustomRouteDrawer.jsx`
**useEffect (lines 177-178):**

```javascript
useEffect(() => {
  if (!map || !isEnabled) {  // Line 178 - exits if not enabled
    // Clean up
    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    // Reset cursor
    if (map) {
      map.setOptions({
        draggableCursor: null,
        draggingCursor: null
      });
    }
    return; // EXIT - no click listener added
  }

  // ... rest of setup code only runs if isEnabled=true
```

**What it does:**
- When `isEnabled=false`, removes click listener
- Resets cursor to default
- **Does NOT execute lines 196-202** (setting up click handling)

---

### Step 4.6: Polyline Persists, Point Markers Hidden

**File:** `CustomRouteDrawer.jsx`

**Polyline rendering (line 41):**
```javascript
if (!map) {  // Only checks for map, NOT isEnabled
```
- **Polyline continues to render** because check is `if (!map)`, not `if (!map || !isEnabled)`

**Point markers (line 83):**
```javascript
if (isEnabled) {  // Only render when enabled
```
- **Point markers are hidden** when `isEnabled=false`

**Result:**
- Locked segment shows the polyline route
- But hides the waypoint dots
- And doesn't accept new clicks

---

### Step 4.7: Toggle is Disabled

**File:** `DirectionsPanel/index.jsx`
**UI (lines 1333-1334):**

```javascript
checked={routeSegments[index]?.isCustom || false}
disabled={routeSegments[index]?.isLocked}  // Line 1334
```

**What it does:**
- Checkbox becomes disabled when segment is locked
- User cannot toggle draw mode off for locked segments

---

## PHASE 5: EDGE CASES & MAP CLICK BLOCKING

### Step 5.1: Blocking Regular Map Clicks During Draw Mode

**File:** `DirectionsPanel/index.jsx`
**useEffect for clickedLocation (lines 625-668):**

```javascript
useEffect(() => {
  if (!clickedLocation || clickedLocation === prevClickedLocationRef.current) return;

  console.log('CLICKED LOCATION EFFECT:');
  console.log('  Clicked location:', clickedLocation);
  console.log('  Current uiLocations:', uiLocations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));
  console.log('  Active input:', activeInput);
  console.log('  routeSegments:', routeSegments);

  // Check if any draw mode is currently active (and NOT locked)
  const isAnyDrawModeActive = routeSegments.some((seg) => {  // Line 633
    // Only consider segments that are in custom draw mode AND not locked
    return seg.isCustom && !seg.isLocked;  // Line 635
  });
  console.log('  Is any draw mode active (unlocked)?', isAnyDrawModeActive);

  if (isAnyDrawModeActive) {  // Line 639
    console.log('  SKIPPING: Draw mode is active, CustomRouteDrawer should handle this click');
    return;  // EXIT - don't process this click
  }

  prevClickedLocationRef.current = clickedLocation;

  // If there's an active input (edit mode), replace that specific location
  if (activeInput !== null && activeInput !== undefined) {
    console.log('  EDIT MODE: Replacing location at index', activeInput);
    updateLocation(activeInput, clickedLocation);
    setActiveInput(null);
  } else {
    // Otherwise, find the first empty slot
    const emptyIndex = uiLocations.findIndex(loc => !loc);

    if (emptyIndex !== -1) {
      console.log('  NORMAL MODE: Empty index found:', emptyIndex);
      console.log('  Adding location at index', emptyIndex);
      updateLocation(emptyIndex, clickedLocation);
    } else {
      console.log('  NORMAL MODE: No empty slots, ignoring click');
    }
  }
}, [clickedLocation, uiLocations, activeInput, routeSegments, updateLocation]);
```

**Critical logic:**
- **Line 633-636**: Checks if ANY segment has `isCustom=true AND isLocked=false`
- **Line 639**: If found, returns early (blocks the click)
- **Why?** Because CustomRouteDrawer's click listener should handle it instead
- **This prevents:** Regular location markers from being placed during draw mode

---

### Step 5.2: Single Location Draw Mode

**File:** `RouteSegmentManager.jsx`
**Special case (lines 377-409):**

```javascript
// Special case: single location in draw mode - just show start marker
if (singleLocationDrawMode) {  // Line 378
  console.log('RouteSegmentManager rendering single location for draw mode');
  clearAllSegments();

  // Create just the start marker
  const location = allLocations.find(l => l !== null);
  if (location) {
    const mode = allModes[0] || 'walk';
    const icon = TRANSPORT_ICONS[mode] || TRANSPORT_ICONS.walk;
    const color = getTransportationColor(mode);

    const scale = getMarkerScale(currentZoomRef.current);
    const markerContent = createMarkerContent(icon, color, false, null, null, scale);

    // Create the marker
    const startMarker = new window.google.maps.marker.AdvancedMarkerElement({
      map,
      position: location,
      content: markerContent,
      title: 'Start',
      zIndex: 5000,
      collisionBehavior: window.google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
    });

    // Store in segmentsRef as an ARRAY element (not object property!)
    segmentsRef.current = [{  // Line 402 - CRITICAL: array, not object
      id: 'single-marker',
      markers: { start: startMarker },
      startLocation: location,
      mode: mode
    }];
  }
  return;
}
```

**What it handles:**
- **Scenario:** First segment in draw mode with only 1 location set
- **Line 378**: Checks for `singleLocationDrawMode` flag
- **Line 402**: Stores as array element (not object property - this was a bug we fixed!)
- **Result:** Shows just the start marker, ready for user to add points

---

### Step 5.3: Component Cleanup

**File:** `CustomRouteDrawer.jsx`
**Cleanup (lines 103-109):**

```javascript
return () => {
  if (mainPolylineRef.current) {
    mainPolylineRef.current.setMap(null);
    mainPolylineRef.current = null;
  }
  clearPointMarkers();
};
```

**What it does:**
- Runs when component unmounts
- Removes polyline from map
- Clears all point markers
- Prevents memory leaks

---

### Step 5.4: Undo System Integration

**File:** `DirectionsPanel/index.jsx`
**Undo function (lines 105-154):**

```javascript
const undo = useCallback(() => {
  if (undoHistory.length === 0) {
    console.log('❌ UNDO: No history to undo');
    return;
  }

  console.log('↩️ UNDO TRIGGERED');
  console.log('  Current undo history length:', undoHistory.length);

  // Get the most recent snapshot
  const lastSnapshot = undoHistory[undoHistory.length - 1];

  console.log('  Restoring snapshot:', {
    actionType: lastSnapshot.actionType,
    locations: lastSnapshot.locations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`),
    customDrawEnabled: lastSnapshot.customDrawEnabled,
    customPoints: Object.keys(lastSnapshot.customPoints).map(k => `seg${k}=${lastSnapshot.customPoints[k].length}pts`),
    lockedSegments: lastSnapshot.lockedSegments
  });

  // Restore state from snapshot
  setLocations(lastSnapshot.locations);
  setLegModes(lastSnapshot.legModes);
  setCustomDrawEnabled(lastSnapshot.customDrawEnabled);  // Line 126
  setSnapToRoads(lastSnapshot.snapToRoads);
  setCustomPoints(lastSnapshot.customPoints);  // Line 128
  setLockedSegments(lastSnapshot.lockedSegments);  // Line 129
```

**What it restores:**
- **Line 126**: `customDrawEnabled` array (draw mode toggles)
- **Line 128**: `customPoints` object (all custom points)
- **Line 129**: `lockedSegments` array (lock states)
- **Result:** Full state restoration, including draw mode

---

## COMPLETE DATA FLOW SUMMARY

### State Arrays (Source of Truth)
```javascript
locations: [A, B, C, null]           // Marker positions
legModes: ['walk', 'walk', 'walk']   // Transport modes
customDrawEnabled: [false, true]     // Draw mode flags
lockedSegments: [false, true]        // Lock flags
customPoints: {                      // Custom waypoints
  1: [{lat, lng}, {lat, lng}, ...]
}
```

### Derived State (useMemo)
```javascript
routeSegments: [
  {
    id: 'seg-0',
    startLocation: A,
    endLocation: B,
    mode: 'walk',
    isCustom: false,
    isLocked: false,
    customPoints: []
  },
  {
    id: 'seg-1',
    startLocation: B,
    endLocation: C,
    mode: 'walk',
    isCustom: true,      // From customDrawEnabled[1]
    isLocked: true,      // From lockedSegments[1]
    customPoints: [...] // From customPoints[1]
  }
]
```

### Component Responsibilities

**DirectionsPanel:**
- Owns all state
- Builds `routeSegments` from state arrays
- Handles undo/redo
- Manages locking
- Blocks map clicks during draw mode

**CustomRouteDrawer:**
- Renders polyline (always, even when locked)
- Renders point markers (only when unlocked)
- Handles click events (only when unlocked)
- Auto-updates end location
- Sets crosshair cursor

**RouteSegmentManager:**
- Renders segment markers (start/end/waypoint)
- Handles Google Directions API
- Renders calculated routes
- Does NOT render custom polylines (CustomRouteDrawer does)

---

## Behavioral Requirements

### Draw Mode Should:
1. ✅ Allow toggling on/off freely before locking
2. ✅ Initialize with straight line if both endpoints exist
3. ✅ Show crosshair cursor when active and unlocked
4. ✅ Capture all map clicks (block regular location placement)
5. ✅ Dynamically update end marker with each click
6. ✅ Lock when user clicks "Add Location"
7. ✅ Persist polyline when locked
8. ✅ Prevent further edits when locked
9. ✅ Support full undo/redo
10. ✅ Work with multiple segments simultaneously

### Toggle OFF Behavior:
- Clears custom points
- Keeps start and end locations
- Google recalculates route
- Can toggle back ON to get straight line

### Locking Behavior:
- Occurs when clicking "Add Location"
- Only locks if segment is in draw mode
- Disables toggle checkbox
- Removes click listener
- Keeps polyline visible
- Hides waypoint dots

---

## Key Bug Fixes Applied

### Bug #1: Polyline Disappeared When Locked
**Location:** `CustomRouteDrawer.jsx` line 41
**Problem:** Checked `if (!map || !isEnabled)` causing polyline cleanup
**Fix:** Changed to `if (!map)` only
**Result:** Locked segments keep their polylines

### Bug #2: Map Clicks Not Blocked During Draw Mode
**Location:** `DirectionsPanel/index.jsx` line 633-636
**Problem:** Had extra condition checking empty locations ahead
**Fix:** Simplified to `seg.isCustom && !seg.isLocked`
**Result:** Draw mode properly captures all clicks

### Bug #3: Single Location Array Bug
**Location:** `RouteSegmentManager.jsx` line 402
**Problem:** Used object notation `segmentsRef.current['single-marker']`
**Fix:** Changed to array notation `segmentsRef.current = [...]`
**Result:** Single location draw mode works correctly

---

## Testing Checklist

- [ ] Toggle draw mode ON from blank segment
- [ ] Toggle draw mode ON from segment with both endpoints
- [ ] Toggle draw mode OFF (converts to Google route)
- [ ] Toggle back ON (creates straight line)
- [ ] Click multiple points in sequence
- [ ] Verify end marker moves dynamically
- [ ] Click "Add Location" to lock segment
- [ ] Verify polyline persists after locking
- [ ] Verify waypoint dots disappear after locking
- [ ] Verify cannot click to add more points when locked
- [ ] Verify cannot toggle off when locked
- [ ] Test undo after adding points
- [ ] Test undo after locking
- [ ] Test undo after toggling
- [ ] Verify map clicks blocked during unlocked draw mode
- [ ] Verify map clicks work after locking draw mode
- [ ] Test with multiple segments in different states
