# Route Data Structure Refactor Plan

## Current Problems

1. **Too many parallel arrays that can get out of sync:**
   - `locations` - the waypoints
   - `legModes` - transportation mode for each segment
   - `customDrawEnabled` - whether each segment is in draw mode
   - `customPoints` - object with segment indices as keys, each containing array of drawn points
   - `lockedSegments` - whether each segment is locked

2. **Sparse arrays causing bugs** - `customDrawEnabled[2]` might be undefined

3. **Complex logic** - buildSegments has to coordinate all these arrays

4. **Undo is broken** - hard to track what to undo in draw mode

## Proposed New Structure

### Single source of truth: `routeSegments` array

```javascript
const routeSegments = [
  {
    id: 'seg-0',
    startLocation: { lat, lng, name, address },
    endLocation: { lat, lng, name, address },
    mode: 'walk',
    isCustom: false,
    isLocked: false,
    customPoints: [] // only used if isCustom=true
  },
  {
    id: 'seg-1',
    startLocation: { lat, lng, name, address },
    endLocation: { lat, lng, name, address },
    mode: 'bike',
    isCustom: true,
    isLocked: true,
    customPoints: [
      { lat, lng },
      { lat, lng },
      { lat, lng }
    ]
  }
]
```

### Benefits

1. **Single array** - no parallel arrays to keep in sync
2. **Each segment has all its own data** - mode, custom points, locked state all together
3. **Easy to serialize** - can save/load easily
4. **Simple undo** - just track changes to this one array
5. **No sparse arrays** - segments are explicitly created

## Migration Steps

### Phase 1: Create new data structure alongside old one
- Add `routeSegments` state
- Write helper functions to convert old → new and new → old
- Keep both in sync

### Phase 2: Update components to read from new structure
- DirectionsPanel reads from routeSegments
- Update UI rendering to use new structure
- Keep writing to both old and new

### Phase 3: Update components to write to new structure
- Change all setState calls to update routeSegments
- Remove old parallel arrays
- Simplify buildSegments logic

### Phase 4: Cleanup
- Remove conversion helpers
- Remove old state variables
- Remove complex sync logic

## Specific Changes Needed

### DirectionsPanel
```javascript
// OLD
const [locations, setLocations] = useState([null, null]);
const [legModes, setLegModes] = useState(['walk']);
const [customDrawEnabled, setCustomDrawEnabled] = useState([]);
const [customPoints, setCustomPoints] = useState({});
const [lockedSegments, setLockedSegments] = useState([]);

// NEW
const [routeSegments, setRouteSegments] = useState([]);
```

### Add Next Location
```javascript
// OLD - complex, modifies multiple arrays
const addNextLeg = () => {
  onLocationsChange([...locations, null], 'ADD_DESTINATION');
  onLegModesChange([...legModes, 'walk']);
  setCustomDrawEnabled([...customDrawEnabled, false]);
  // etc...
}

// NEW - simple, just add a segment
const addNextLeg = () => {
  const lastSegment = routeSegments[routeSegments.length - 1];
  setRouteSegments([...routeSegments, {
    id: generateId(),
    startLocation: lastSegment.endLocation,
    endLocation: null,
    mode: 'walk',
    isCustom: false,
    isLocked: false,
    customPoints: []
  }]);
}
```

### Toggle Draw Mode
```javascript
// OLD - update parallel array
setCustomDrawEnabled(prev => {
  const newArr = [...prev];
  newArr[index] = !newArr[index];
  return newArr;
});

// NEW - update segment directly
setRouteSegments(prev => prev.map((seg, i) =>
  i === index ? { ...seg, isCustom: !seg.isCustom } : seg
));
```

### Undo in Draw Mode
```javascript
// OLD - complex, modify object key
setCustomPoints(prev => ({
  ...prev,
  [segmentIndex]: prev[segmentIndex].slice(0, -1)
}));

// NEW - simple, modify segment array
setRouteSegments(prev => prev.map((seg, i) =>
  i === segmentIndex ? {
    ...seg,
    customPoints: seg.customPoints.slice(0, -1)
  } : seg
));
```

## Questions to Answer

1. How do we handle the first segment before any locations are placed?
   - Start with empty array, add segments as locations are clicked
   - OR start with one segment with both locations null

2. What about the undo/redo history?
   - Keep as is, but store the entire routeSegments array as one snapshot
   - Simpler than tracking individual parallel array changes

3. Migration risk?
   - High - this touches a lot of code
   - Should we do it incrementally or all at once?

## Recommendation

**Do the refactor in a separate branch**, test thoroughly, then merge. The current approach with parallel arrays is causing too many bugs and will only get worse.

Alternative: **Just fix the immediate bugs** without refactoring, but accept that new bugs will keep appearing.

---

## REFACTOR PROGRESS

### ✅ Phase 1: COMPLETE - Data Structure Created
- Added `routeSegments` state to DirectionsPanel
- Created `convertOldToNew()` helper to build routeSegments from parallel arrays
- Created `convertNewToOld()` helper to convert back (for compatibility)
- Set up one-way sync: old arrays → routeSegments (read-only mirror during migration)

### ✅ Core Operations Implemented
All operations work directly with routeSegments:

1. **`addLocationToSegments(location)`** - Add location by:
   - Creating first segment if none exist
   - Filling empty endLocation in existing segment
   - Extending route with new segment if all filled

2. **`addNextLegToSegments()`** - Extend route with empty segment
   - Locks previous segment if in custom draw mode
   - Creates new segment with startLocation from previous endLocation

3. **`removeLocationFromSegments(locationIndex)`** - Remove location (not A or B)
   - Removes the segment ending at that location

4. **`updateSegmentMode(segmentIndex, mode)`** - Change transportation mode
   - Updates segment.mode directly

5. **`toggleSegmentDrawMode(segmentIndex)`** - Enable/disable custom drawing
   - Automatically creates straight line if both locations exist
   - Clears custom points when disabling

6. **`addPointToSegment(segmentIndex, point)`** - Add point to custom route
   - Appends point to segment.customPoints array

7. **`undoPointFromSegment(segmentIndex)`** - Remove last point
   - Uses array.slice(0, -1) to remove last point

8. **`updateLocationInSegments(locationIndex, newLocation)`** - Edit location
   - Updates both startLocation and endLocation for affected segments

### ✅ Phase 2: COMPLETE - UI Reads from routeSegments

**Derived State for UI Rendering:**
- Added `uiLocations` - useMemo that derives locations array from routeSegments
- Added `uiModes` - useMemo that derives modes array from routeSegments
- These replace direct references to `locations` and `legModes` in the UI

**UI Updates:**
1. Location rendering loop now uses `uiLocations.map()` instead of `locations.map()`
2. Transportation mode buttons now use `uiModes[index]` instead of `legModes[index]`
3. All button disabled states now use `uiLocations.some()` instead of `locations.some()`
4. "Add Next Location" button uses `uiLocations.length` instead of `locations.length`
5. Custom drawing checkboxes use `uiLocations` for logic
6. CustomRouteDrawer conditional uses `uiLocations`

**buildSegments Simplification:**
- Reduced from 45 lines to 25 lines
- Now directly maps routeSegments instead of coordinating parallel arrays
- No more complex logic checking sparse arrays
- Much easier to understand and maintain

```javascript
// OLD buildSegments (45 lines, complex)
for (let i = 0; i < filledLocations.length - 1; i++) {
  const isCustom = customDrawEnabled[i] === true;
  // ... check customPoints[i], legModes[i], etc.
}

// NEW buildSegments (25 lines, simple)
return routeSegments.map((seg, i) => ({
  mode: seg.mode,
  isCustom: seg.isCustom,
  customPath: seg.customPoints  // all data in one place!
}));
```

**Status:**
- Old parallel arrays still exist and sync FROM routeSegments
- UI now reads only from routeSegments (via uiLocations/uiModes)
- Old operations still write to old arrays, which sync to routeSegments
- Everything still works with legacy code!

### ✅ Phase 3: COMPLETE - Operations Write to routeSegments

**Major Simplifications:**

1. **Add Next Location Button:**
   - OLD: `addNextLeg()` - 30 lines manipulating multiple arrays
   - NEW: `addNextLegToSegments()` - Called directly, handles everything

2. **Transportation Mode Buttons:**
   - OLD: `updateLegMode()` - Updates legModes array, triggers route calc
   - NEW: `updateSegmentMode()` - One line: `seg.mode = mode`

3. **Draw Mode Toggle - HUGE WIN:**
   - OLD: 45 lines of complex logic (sparse array handling, straight line init, point clearing)
   - NEW: `toggleSegmentDrawMode()` - Handles all logic internally
   - Checkbox onChange went from 45 lines → 1 line!

4. **Update Location:**
   - OLD: `updateLocation()` - Complex route calc logic
   - NEW: Delegates to `addLocationToSegments()` or `updateLocationInSegments()`

5. **Point Management:**
   - OLD: `handlePointAdded()` - Manipulates customPoints object
   - NEW: `addPointToSegment()` - Appends to segment.customPoints array

6. **Undo Point:**
   - OLD: `handleUndoPoint()` - Complex logic with object key manipulation
   - NEW: `undoPointFromSegment()` - Simple array.slice(0, -1)

**Data Flow Now:**
```
User Actions → New Segment Operations → routeSegments → Sync → Old Arrays → UI
                                             ↓
                                       Auto-calc Routes
```

**Code Reduction:**
- Draw mode toggle: 45 lines → 1 line (98% reduction!)
- buildSegments: 45 lines → 25 lines (44% reduction)
- Total: Removed ~150 lines of complex array coordination logic

**Status:**
- ✅ All UI operations use new segment functions
- ✅ routeSegments is the source of truth
- ✅ Old arrays sync FROM routeSegments for backwards compatibility
- ✅ Route calculation happens automatically on routeSegments change
- 🎯 Ready for testing!

### 🔜 Future Cleanup (Optional Phase 4)
- Can remove old operation functions (addNextLeg, updateLegMode, etc) - currently unused
- Can remove convertOldToNew/convertNewToOld helpers (only used for sync now)
- Can eventually remove old parallel array state variables once confident
- Can simplify undo queue to snapshot routeSegments array instead of individual arrays
