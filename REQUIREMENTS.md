# Complete Functionality Requirements

## Core Route Building
1. **Drop markers** - Click map to place location A, B, C, etc.
2. **Search for locations** - Type to search and place markers
3. **Add next location** - Button to add location C, D, E after A→B
4. **Remove locations** - Delete intermediate waypoints (not A or B)
5. **Edit locations** - Click on location label to edit via search or map click
6. **Change transportation modes** - Walk, bike, car, bus, transit, flight per segment

## Markers (CRITICAL - No Duplicates)
- **One marker at the START of each segment** (location A, B, C...)
- **One marker at the END of the complete route** (final location)
- **Transition markers** - When mode changes between segments (split circle showing both modes)
- **NO duplicate markers** at transition points

## Custom Draw Mode
1. **Enable draw mode** per segment
2. **Click to add points** - Build custom route point by point
3. **Straight line initialization** - When enabling draw mode with both locations set, create straight line
4. **Undo point** - Remove last clicked point in current segment
5. **Redo point** - (if we had it?)
6. **Lock segment** - When adding next location, lock previous segment's draw mode
7. **Crosshair cursor** when draw mode active
8. **Normal cursor** when hovering over map panning

## Undo Queue (CRITICAL - Everything Must Be Undoable)
Must track and allow undo for:
1. **Add location** - Undo placing a marker
2. **Remove location** - Undo deleting a waypoint
3. **Edit location** - Undo editing a location
4. **Change mode** - Undo changing walk→bike
5. **Enable draw mode** - Undo toggling custom drawing
6. **Disable draw mode** - Undo toggling back to calculated
7. **Add point in draw mode** - Undo each clicked point individually
8. **Remove point in draw mode** - Track when user undoes a point

## Edit Mode
1. **Click location label** to enter edit mode
2. **Type to search** for new location
3. **Click map** to set new location
4. **ESC to cancel**
5. **Auto-recalculate** route after edit
6. **First marker must not disappear** when editing second marker

## Draw Mode Behavior
1. **Regular segment → Draw segment → Regular segment** all work together
2. **Draw mode doesn't extend to next segment** when adding location
3. **Calculated route disappears** when enabling draw mode
4. **Straight line appears** connecting start→end when draw mode enabled
5. **Can add points after straight line** to customize path
6. **Points show as small circles** along the path

## Route Calculation & Display
1. **Auto-calculate** routes when locations filled
2. **Different colors** per transportation mode
3. **Polylines** show calculated routes
4. **Custom polylines** show drawn routes
5. **Flight mode uses arcs** not straight lines
6. **No double markers** on flight segments
7. **Routes animate** when playing animation

## Known Bugs We Fixed
1. ✅ First marker disappearing after editing second marker
2. ✅ Draw mode extending to next segment instead of ending
3. ✅ Calculated route not clearing when enabling draw mode
4. ✅ Double markers on flight segments
5. ✅ Sparse arrays causing undefined issues
6. ✅ No straight line when enabling draw mode before placing end location

## Known Bugs Still Happening
1. ❌ First point in draw mode shows "2 points to undo"
2. ❌ Undoing first point changes marker B to different location
3. ❌ Draw mode undo queue is completely fucked
4. ❌ Parallel arrays getting out of sync

## Data Structure Problems (Why We're Refactoring)
- 5 parallel arrays: locations, legModes, customDrawEnabled, customPoints, lockedSegments
- Arrays can have different lengths
- Sparse arrays with undefined values
- Complex sync logic in buildSegments
- Hard to track what changed for undo
- Easy to forget to update one array when changing others

## New Data Structure Solution
Single `routeSegments` array where each segment has:
```javascript
{
  id: 'seg-123',
  startLocation: {lat, lng, name, address},
  endLocation: {lat, lng, name, address},
  mode: 'walk',
  isCustom: false,
  isLocked: false,
  snapToRoads: false,
  customPoints: [{lat, lng}, {lat, lng}, ...]
}
```

All segment data together, no parallel arrays, no sync issues.
