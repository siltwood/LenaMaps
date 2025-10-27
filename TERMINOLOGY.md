# LenaMaps Terminology Guide

This document defines all shared terms used throughout the LenaMaps codebase to ensure clear communication and consistent implementation.

---

## Route & Segment Concepts

### **Route**
The complete journey from start to finish, consisting of one or more segments.
- Example: A → B → C → D is a route with 3 segments

### **Segment**
A single leg of the journey between two consecutive locations.
- **Segment 0**: A → B (first segment)
- **Segment 1**: B → C (middle segment)
- **Segment 2**: C → D (last segment)
- Formula: `numberOfSegments = numberOfLocations - 1`

### **Segment Index**
Zero-based index identifying a segment.
- For locations [A, B, C, D]:
  - Segment 0 = locations[0] → locations[1]
  - Segment 1 = locations[1] → locations[2]
  - Segment 2 = locations[2] → locations[3]

---

## Location & Marker Concepts

### **Location**
A geographical point with coordinates (lat/lng) and optional metadata (name, address).
```javascript
{
  lat: 37.7749,
  lng: -122.4194,
  name: "San Francisco",
  address: "San Francisco, CA"
}
```

### **Location Marker** (Big Icons)
A visual indicator on the map placed AT A LOCATION (not floating on a segment).
- Large markers with transportation mode icons
- Shows START, END, or waypoint/transition points
- **SINGLE SOURCE OF TRUTH**: `RouteSegmentManager.jsx` ONLY

### **Waypoint Dot** (Small Circles)
Small circular markers showing user-clicked points in custom draw mode.
- Only visible when custom segment is unlocked (being edited)
- Created by `CustomRouteDrawer.jsx`
- NOT the same as location markers
- Hidden when segment is locked

### **Marker Placement Rule**
**CRITICAL**: Each location should have exactly ONE location marker (not counting waypoint dots).

For a route A → B → C → D:
- **Location A**: START marker (created by segment 0)
- **Location B**: Waypoint/Transition marker (created by segment 1)
- **Location C**: Waypoint/Transition marker (created by segment 2)
- **Location D**: END marker (created by segment 2)

### **Marker Types**

#### **START Marker**
- Placed at the first location (location 0)
- Created by segment 0 only
- Label: "Start"

#### **END Marker**
- Placed at the last location (last in array)
- Created by the last segment only
- Label: "End"

#### **Waypoint Marker**
- Placed at intermediate locations
- Created when mode DOES NOT change
- Label: "Stop 2", "Stop 3", etc.

#### **Transition Marker**
- Placed at intermediate locations
- Created when transportation mode CHANGES
- Shows both the previous and next mode icons
- Indicates a mode switch point

---

## Segment Origin & Destination

### **Segment Origin** (`segmentOrigin`)
The START point of a segment.
- For segment `i`: `locations[i]`
- This is where the segment's marker is placed

### **Segment Destination** (`segmentDestination`)
The END point of a segment.
- For segment `i`: `locations[i + 1]`
- Only the LAST segment creates a marker here (the END marker)

---

## Transportation Modes

### **Mode Types**
- `walk` - Walking/pedestrian
- `bike` - Bicycling
- `car` - Driving
- `bus` - Private bus (rendered as car with bus styling)
- `transit` - Public rail transit (subway, train, tram)

### **Mode Icon**
Emoji representing the transportation mode:
- 🚶 Walk
- 🚴 Bike
- 🚗 Car
- 🚌 Bus
- 🚊 Transit

### **Mode Color**
Visual color for polylines and markers:
- Walk: Blue
- Bike: Green
- Car: Purple
- Bus: Orange
- Transit: Red

---

## Custom Draw Mode Concepts

### **Custom Segment** (`isCustom`)
A segment where the user manually draws the route instead of using Google's calculated route.

### **Custom Points** (`customPoints`)
Array of user-clicked waypoints that define a custom route.
```javascript
customPoints = {
  0: [{lat, lng}, {lat, lng}, ...],  // Segment 0's points
  1: [{lat, lng}, {lat, lng}, ...]   // Segment 1's points
}
```

### **Locked Segment** (`isLocked`)
A segment that can no longer be edited (occurs when user adds next location).

### **Draw Mode Enabled** (`customDrawEnabled`)
Boolean array indicating which segments are in custom draw mode.
```javascript
customDrawEnabled = [false, true, false]  // Only segment 1 is custom
```

---

## State Management

### **State Arrays**
Core state in `DirectionsPanel/index.jsx`:
- `locations` - Array of location objects
- `legModes` - Array of transportation mode strings
- `customDrawEnabled` - Array of booleans for draw mode
- `lockedSegments` - Array of booleans for locked state
- `customPoints` - Object mapping segment index to points array
- `snapToRoads` - Array of booleans for snap-to-roads

### **Derived State: `routeSegments`**
Computed from state arrays via `useMemo`. Single source of truth passed to child components.
```javascript
routeSegments = [
  {
    id: 'seg-0',
    startLocation: locations[0],
    endLocation: locations[1],
    mode: 'walk',
    isCustom: false,
    isLocked: false,
    customPoints: []
  },
  // ... more segments
]
```

---

## Rendering Concepts

### **Polyline**
The visual path/line connecting two points on the map.

### **DirectionsRenderer**
Google Maps component that renders a calculated route (polyline + turn-by-turn).

### **CustomRouteDrawer**
LenaMaps component that renders user-drawn custom routes.

### **RouteSegmentManager**
LenaMaps component that orchestrates all segment rendering (both custom and calculated).

---

## Coordinate Systems

### **LatLng Object**
```javascript
{ lat: number, lng: number }
```

### **Google LatLng Class**
```javascript
new google.maps.LatLng(lat, lng)
```

---

## Key Implementation Rules

### ✅ Marker Rule
**Each location gets exactly ONE marker, created by the segment that STARTS at that location.**
- Exception: The last location gets an END marker from the last segment

### ✅ Segment Responsibility
**Each segment is responsible for:**
1. Creating a marker at its START location (origin)
2. Rendering the polyline from start to end
3. If it's the last segment: Also creating the END marker at destination

### ✅ Custom vs Calculated
**Custom segments:**
- Render polyline via CustomRouteDrawer
- Create markers via RouteSegmentManager
- Do NOT use DirectionsRenderer

**Calculated segments:**
- Render polyline via DirectionsRenderer
- Create markers via RouteSegmentManager
- Suppress DirectionsRenderer's built-in markers

---

## Common Patterns

### Getting Last Segment Index
```javascript
const lastSegmentIndex = locations.length - 2;
```

### Checking if Segment is Last
```javascript
const isLastSegment = i === validLocations.length - 2;
```

### Getting Segment Locations
```javascript
const segmentOrigin = validLocations[i];
const segmentDestination = validLocations[i + 1];
```

---

## Anti-Patterns (Don't Do This)

❌ **DON'T** create location markers at both start AND end of every segment
❌ **DON'T** create location markers at segment midpoints
❌ **DON'T** create location markers anywhere except RouteSegmentManager.jsx
❌ **DON'T** create location markers inside CustomRouteDrawer (only waypoint dots allowed)
❌ **DON'T** use floating/arbitrary marker positions
❌ **DON'T** confuse waypoint dots (small circles in CustomRouteDrawer) with location markers (big icons)

## Debugging Marker Issues

### If you see too many markers:
1. Check if `RouteSegmentManager.jsx` is creating duplicates
2. Verify segments are being cleaned up properly (check `clearSegment()`)
3. Look for multiple renders of the same segment
4. Check if `segmentsRef.current` is being managed correctly

### If markers are in wrong positions:
1. Verify `segmentOrigin` is `locations[i]` (not `i+1`)
2. Check that only last segment creates END marker at destination
3. Ensure marker creation follows the rule: "marker at segment START only"

---

## File Reference & Responsibilities

### **State Management**
- `DirectionsPanel/index.jsx` - Owns all route state

### **Route Rendering**
- `RouteSegmentManager.jsx` - Orchestrates all segment rendering

### **Marker Creation** (SINGLE SOURCE OF TRUTH)
- `RouteSegmentManager.jsx` - **ONLY** place that creates location markers
  - `createMarker()` - Creates standard location markers
  - `createTransitionMarker()` - Creates mode-change markers

### **Custom Drawing**
- `CustomRouteDrawer.jsx` - Handles custom route drawing
  - Creates polyline for custom segments
  - Creates waypoint dots (small circles) for clicked points
  - **DOES NOT** create location markers

### **Polyline Rendering**
- Custom segments: `CustomRouteDrawer.jsx` (Polyline)
- Calculated segments: Google's `DirectionsRenderer`

---

This terminology guide should be updated whenever new concepts are introduced to the codebase.
