// to start server:
// npx vite 
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as turf from '@turf/turf';
import earcut from "earcut"; // Used for triangulation of skeletonisation
import { deflate } from 'three/examples/jsm/libs/fflate.module.js';
import {SkeletonBuilder} from 'straight-skeleton';
SkeletonBuilder.init();
SkeletonBuilder.init().catch((error) => {
    console.error("Failed to initialize SkeletonBuilder:", error);
});

// Colors
const wallColor       = 0xDAC6C6;
const bottomWallColor = 0x8f7070;
const bluePrintColor  = 0xDAC6C6;
const groundColor     = 0x4D6C50;
const pointsColor     = 0xE1E1E1;
const roofColor       = 0xcc3300;
const windowColor     = 0xffffff;
const skyColor        = 0x66ccff;

// Load models
const windowWidth = 0.9;
const windowHeight = 1.38;
const windowElevation = 0.7;
const doorWidth = 1.7;
const doorHeight = 2.1;
const doorElevation = 0;
const doorMod = 10; // Place door every 10 windows (bottom floor)
const windowEntranceWidth = 1.7;
const windowEntranceHeight = 1.4;
const windowEntranceElevation = 0.6;

let windowModel = null;
let doorModel   = null;
let windowEntranceModel = null;
const loader = new GLTFLoader();
loader.load('models/window1.glb', function (gltf) {
    windowModel = gltf.scene;
    console.log("Window model loaded!");
}, undefined, function (error) {
    console.error('Error loading window model:', error);
});
loader.load('models/door1.glb', function (gltf) {
    doorModel = gltf.scene;
    console.log("Door model loaded!");
}, undefined, function (error) {
    console.error('Error loading door model:', error);
});
loader.load('models/window-entrance1.glb', function (gltf) {
    windowEntranceModel = gltf.scene;
    console.log("Entrance window model loaded!");
}, undefined, function (error) {
    console.error('Error loading entrance window model:', error);
});

// Select containers for left and right sides
const leftContainer = document.getElementById('left');
const rightContainer = document.getElementById('right');

// Set up the scene, camera, and renderer for the left side
const leftScene = new THREE.Scene();
const leftCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
leftCamera.position.z = 10;
leftCamera.zoom = 0.1;

const leftRenderer = new THREE.WebGLRenderer();
leftRenderer.setSize(leftContainer.offsetWidth, leftContainer.offsetHeight);
leftContainer.appendChild(leftRenderer.domElement);

// Set up the scene, camera, and renderer for the right side
const rightScene = new THREE.Scene();
const rightCamera = new THREE.PerspectiveCamera(30, rightContainer.offsetWidth / rightContainer.offsetHeight, 0.1, 1000);
rightCamera.position.set(5, 10, 10);
rightCamera.lookAt(0, 0, 0);

// Ground plane
const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
const grassMaterial = new THREE.MeshBasicMaterial({
    color: groundColor,
    side: THREE.DoubleSide, 
    wireframe: false
});
const grassPane = new THREE.Mesh(planeGeometry, grassMaterial);
grassPane.rotation.x = - Math.PI / 2;
grassPane.position.set(0, 0, 0);
rightScene.add(grassPane);
rightScene.background = new THREE.Color(skyColor);

const rightRenderer = new THREE.WebGLRenderer({
    stencil: true,
    depth: true, 
    antialias: true
});
rightRenderer.setSize(rightContainer.offsetWidth, rightContainer.offsetHeight);
rightContainer.appendChild(rightRenderer.domElement);

// Directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 3); // Adjust intensity to a more moderate value
directionalLight.position.set(10, 10, 1); // Position of the light in the 3D space
rightScene.add(directionalLight);

// Ambient light
const ambientLight = new THREE.AmbientLight(0x404040, 10); // Soft white light with moderate intensity
rightScene.add(ambientLight);

const wallMaterial = new THREE.MeshPhongMaterial({
    color: wallColor,
    side: THREE.DoubleSide, // Make sure both sides are visible
    wireframe: false
    // Stencil to hide wall where windows are placed
});

const bottomWallMaterial = new THREE.MeshPhongMaterial({
    color: bottomWallColor,
    side: THREE.DoubleSide, // Make sure both sides are visible
    wireframe: false
    // Stencil to hide wall where windows are placed
});

const windowMaterial = new THREE.MeshBasicMaterial({
    color: windowColor,  
    side: THREE.DoubleSide,
    opacity: 0.5,
    transparent: true
});

const stencilMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false, // Don't draw color
    depthWrite: false, // Don't write to depth buffer
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilRef: 1,
    stencilZPass: THREE.ReplaceStencilOp, // Replace stencil where this mesh is drawn
});

// Get references to the slider and value display
const deflationFactorSlider  = document.getElementById("deflationFactorSlider");
const deflationFactorDisplay = document.getElementById("deflationFactorValue");

const floorHeightSlider  = document.getElementById("floorHeightSlider");
const floorHeightDisplay = document.getElementById("floorHeightValue");

const floorCountSlider  = document.getElementById("floorCountSlider");
const floorCountDisplay = document.getElementById("floorCountValue");

const roofHeightSlider  = document.getElementById("roofHeightSlider");
const roofHeightDisplay = document.getElementById("roofHeightValue");

const windowDistanceSlider  = document.getElementById("windowDistanceSlider");
const windowDistanceDisplay = document.getElementById("windowDistanceValue");

// Init building properties
let floorCount      = parseFloat(floorCountSlider.value);
let floorHeight     = parseFloat(floorHeightSlider.value);
let deflationFactor = parseFloat(deflationFactorSlider.value);
let roofHeight      = parseFloat(roofHeightSlider.value);
let windowDistance  = 3; //parseFloat(windowDistanceDisplay.value); This does not work for some reason TODO fix this!

// Add an event listener to the slider to update the value
deflationFactorSlider.addEventListener("input", () => {
    deflationFactor = parseFloat(deflationFactorSlider.value);
    deflationFactorDisplay.textContent = deflationFactor.toFixed(2);
    update3DProjection();
});

floorHeightSlider.addEventListener("input", () => {
    floorHeight = parseFloat(floorHeightSlider.value);
    floorHeightDisplay.textContent = floorHeight.toFixed(2);
    update3DProjection();
});

floorCountSlider.addEventListener("input", () => {
    floorCount = parseFloat(floorCountSlider.value);
    floorCountDisplay.textContent = floorCount.toFixed(2);
    update3DProjection();
});

roofHeightSlider.addEventListener("input", () => {
    roofHeight = parseFloat(roofHeightSlider.value);
    roofHeightDisplay.textContent = roofHeight.toFixed(2);
    update3DProjection();
});

windowDistanceSlider.addEventListener("input", () => {
    windowDistance = parseFloat(windowDistanceSlider.value);
    windowDistanceDisplay.textContent = windowDistance.toFixed(2);
    update3DProjection();
});

// Adjust camera and renderer on window resize
function onWindowResize() {
    const leftAspect = leftContainer.offsetWidth / leftContainer.offsetHeight;
    const viewSize = 10; // Fixed world size
    leftCamera.left = -viewSize * leftAspect;
    leftCamera.right = viewSize * leftAspect;
    leftCamera.top = viewSize;
    leftCamera.bottom = -viewSize;
    leftCamera.updateProjectionMatrix();
    leftRenderer.setSize(leftContainer.offsetWidth, leftContainer.offsetHeight);

    const rightAspect = rightContainer.offsetWidth / rightContainer.offsetHeight;
    rightCamera.aspect = rightAspect;
    rightCamera.updateProjectionMatrix();
    rightRenderer.setSize(rightContainer.offsetWidth, rightContainer.offsetHeight);
}

onWindowResize();
window.addEventListener('resize', onWindowResize);

// Variables for interactive points and polygon
let points = [];
let sortedPoints = [];
let pointMeshes = [];
let polygon = null;
let hoveredPoint = null;

// Right-side 3D polygon
let buildingWalls = null;

// Material for points and lines
const pointMaterial = new THREE.MeshBasicMaterial({ color: pointsColor });
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
const polygonMaterial = new THREE.MeshBasicMaterial({
    color: bluePrintColor,
    side: THREE.DoubleSide,
    wireframe: false,
});

// Function to create a point mesh
const pointRadius = 1.2
function createPoint(x, y) {
    const geometry = new THREE.CircleGeometry(pointRadius, 8);
    const point = new THREE.Mesh(geometry, pointMaterial);
    point.position.set(x, y, 0);
    return point;
}

function polySort(points) {
    // Step 1: Calculate the center of mass (centroid)
    const center = points.reduce((acc, p) => {
        acc.x += p.x;
        acc.y += p.y;
        return acc;
    }, { x: 0, y: 0 });
    
    center.x /= points.length;
    center.y /= points.length;

    // Step 2: Convert points to polar coordinates (angle, distance)
    const annotatedPoints = points.map(p => {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const angle = Math.atan2(dy, dx);  // Polar angle (radians)
        const distanceSquared = dx * dx + dy * dy;  // Squared distance
        return { ...p, angle, distanceSquared };
    });

    // Step 3: Sort points by angle and then by distance
    annotatedPoints.sort((a, b) => {
        if (a.angle !== b.angle) {
            return a.angle - b.angle;
        }
        return a.distanceSquared - b.distanceSquared;
    });

    // Step 4: Return the sorted points
    return annotatedPoints.map(p => ({ x: p.x, y: p.y }));
}

function updatePolygon() {
    sortedPoints = polySort(points); // Sort the points in counter-clockwise order (ie creates a non-intersecting polygon)
    // sortedPoints = points;
    if (polygon) {
        leftScene.remove(polygon);
    }
    if (points.length > 2) {
        // Create the shape from the sorted points
        const shape = new THREE.Shape(sortedPoints.map(p => new THREE.Vector2(p.x, p.y)));
        const geometry = new THREE.ShapeGeometry(shape);
        polygon = new THREE.Mesh(geometry, polygonMaterial);
        leftScene.add(polygon);
    }
    if (!selectedPoint) {
        update3DProjection();
    }
}

let previousInnerMeshes = [];
let previousRoofMesh    = null;
let previosRoofSkeleton = null;
let previosWindowMeshes = null;
function genCourtyardShapes(points, deflationFactor) {
    // Step 1: Convert the points into a Turf.js polygon
    const coordinates = points.map(p => [p.x, p.y]);
    const polygon = turf.polygon([[...coordinates, coordinates[0]]]);

    // Step 2: Use Turf.js to create a buffer around the polygon
    // Negative value for deflation (shrink the polygon)
    const offsetPolygon = turf.buffer(polygon, -deflationFactor);

    // Step 3: Check if the deflation factor has shrunk the polygon too much
    if (!offsetPolygon || turf.area(offsetPolygon) <= 0) {
        return []; // Return empty array if the deflation is too high or the polygon is invalid
    }

    // Step 4: Handle multiple inner shapes (MultiPolygon)
    const geometries = offsetPolygon.geometry.type === 'MultiPolygon' 
        ? offsetPolygon.geometry.coordinates 
        : [offsetPolygon.geometry.coordinates];

    // Step 5: Convert each inner polygon into a THREE.Shape
    const innerShapes = geometries.map((coords) => {
        const innerShape = new THREE.Shape();
        const [outerRing] = coords; // Use the first ring (outer boundary) of each polygon
        innerShape.moveTo(outerRing[0][0], outerRing[0][1]);
        outerRing.forEach((coord) => innerShape.lineTo(coord[0], coord[1]));
        innerShape.lineTo(outerRing[0][0], outerRing[0][1]); // Close the loop
        return innerShape;
    });

    return innerShapes; // Return an array of inner shapes
}


function ensureCounterClockwise(points) {
    const area = points.reduce((sum, point, i) => {
        const nextPoint = points[(i + 1) % points.length];
        return sum + (nextPoint[0] - point[0]) * (nextPoint[1] + point[1]);
    }, 0);

    // If area is negative, the points are clockwise; if positive, they're counter-clockwise
    if (area > 0) {
        return points.reverse(); // Reverse points to make them counter-clockwise
    }
    return points;
}

function ensureClockwise(points) {
    const area = points.reduce((sum, point, i) => {
        const nextPoint = points[(i + 1) % points.length];
        return sum + (nextPoint[0] - point[0]) * (nextPoint[1] + point[1]);
    }, 0);

    // If area is negative, the points are clockwise; if positive, they're counter-clockwise
    if (area < 0) {
        return points.reverse(); // Reverse points to make them counter-clockwise
    }
    return points;
}

function shapeToPolygon(shape) {
    // Extract the outer and inner rings (holes)
    const outerRing = shape.getPoints(); // Get the outer boundary
    const holes = shape.holes; // Get the holes (inner rings)

    // Convert the outer ring to the required format (x, y)
    const outerPolygon = outerRing.map(point => [point.x, point.y]);

    // Ensure the outer ring is counter-clockwise
    const outerPolygonCCW = ensureCounterClockwise(outerPolygon);

    // Convert the holes (inner rings) to the required format and ensure clockwise order
    const innerPolygons = holes.map(hole => {
        const holePoints = hole.getPoints().map(point => [point.x, point.y]);
        return ensureClockwise(holePoints); // Ensure clockwise ordering for holes
    });

    // Return the polygon in the required format
    return [outerPolygonCCW, ...innerPolygons];
}

function inflateShape(shape, radius) {
    // Extract the points from the shape using getSpacedPoints (returns an array of THREE.Vector2)
    const geoJsonCoords = shapeToPolygon(shape);
    // Create a GeoJSON polygon
    const geojson = turf.polygon(geoJsonCoords);
  
    // Buffer (inflate) the shape using Turf.js
    const offsetPolygon = turf.buffer(geojson, radius);

    // Process the result
    const geometries = offsetPolygon.geometry.type === 'MultiPolygon' 
        ? offsetPolygon.geometry.coordinates 
        : [offsetPolygon.geometry.coordinates];

    // Step 5: Convert each inner polygon into a THREE.Shape
    const innerShapes = geometries.map((coords) => {
        const innerShape = new THREE.Shape();
        const [outerRing] = coords; // Use the first ring (outer boundary) of each polygon
        innerShape.moveTo(outerRing[0][0], outerRing[0][1]);
        outerRing.forEach((coord) => innerShape.lineTo(coord[0], coord[1]));
        innerShape.lineTo(outerRing[0][0], outerRing[0][1]); // Close the loop
        return innerShape;
    });

    // Convert the buffered GeoJSON back to three.js geometry
    const inflatedShape = offsetPolygon.geometry.coordinates[0].map(pt => new THREE.Vector2(pt[0], pt[1]));
  
    // Create a new three.js Shape from the inflated coordinates
    const newShape = new THREE.Shape(inflatedShape);

    // Add holes
    innerShapes.forEach((innerShape) => {
        outerShape.holes.push(innerShape);
    });

    // Return the inflated shape as a THREE.Shape
    return newShape;
  }

function skeletonizeShape(shape, elevation, roofHeight) {
    // Inflate shape slightly to create overhang
    const polygon = shapeToPolygon(shape);
    
    // Generate the skeleton mesh using the polygon
    const result = SkeletonBuilder.buildFromPolygon(polygon);

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (const polygon of result.polygons) {
        const polygonVertices = [];

        for (let i = 0; i < polygon.length; i++) {
            const vertex = result.vertices[polygon[i]];
            polygonVertices.push(
                (vertex[0]),
                (vertex[1]),
                (vertex[2])
            );
        }

        const triangles = earcut(polygonVertices, null, 3);

        for (let i = 0; i < triangles.length / 3; i++) {
            for (let j = 0; j < 3; j++) {
                const index = triangles[i * 3 + j];
                vertices.push(polygonVertices[index * 3], polygonVertices[index * 3 + 1], polygonVertices[index * 3 + 2]);
            }
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));

    // Recalculate the normals
    geometry.computeVertexNormals();

    const roofMaterial = new THREE.MeshPhongMaterial({
        color: roofColor,
        side: THREE.DoubleSide,
        wireframe: false,
        shininess: 30,   // Controls the shininess of the material
        flatShading: false // Set to true for flat shading if desired
    });

    const skeletonMesh = new THREE.Mesh(geometry, roofMaterial);

    // lets scale the roof so its a fixed height
    // First we find the original height by finding min and max y of the vertices
    const yValues = vertices.filter((_, index) => index % 3 === 2);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const currHeight = (maxY - minY);
    const roofScale = roofHeight/currHeight;

    skeletonMesh.scale.z = roofScale;
    skeletonMesh.position.y = elevation;
    skeletonMesh.rotation.x = -Math.PI / 2;

    return skeletonMesh;
}

function genRoofMesh(buildingShape, elevation, roofColor) {
    // TODO Can probably be removed (unused)
    // Ensure the input is a valid THREE.Shape
    if (!(buildingShape instanceof THREE.Shape)) {
        throw new Error("Invalid building shape: Must be an instance of THREE.Shape.");
    }

    // Generate roof
    const shapeGeometry = new THREE.ShapeGeometry(buildingShape);
    const material = new THREE.MeshStandardMaterial({ color: roofColor, side: THREE.DoubleSide, wireframe: false });
    const roofMesh = new THREE.Mesh(shapeGeometry, material);

    // Compute the bounding box of the building shape to determine its height
    const boundingBox = new THREE.Box3().setFromObject(roofMesh);
    const buildingHeight = boundingBox.max.z - boundingBox.min.z;

    // Elevate the roof by the specified amount above the building height
    roofMesh.position.y = buildingHeight + elevation;
    roofMesh.rotation.x = -Math.PI / 2;
    return roofMesh;
}

function getWindowPoints(polygon, windowDistance) {
    let windowPoints = [];
    for (let i = 0; i < polygon.length; i++) {
        let p1 = polygon[i];
        let p2 = polygon[(i + 1) % polygon.length]; // Wrap around for closed polygon
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);  // Calculate angle for window placement
        const wallWidth = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        const windowCount = Math.floor(wallWidth / windowDistance); // Number of windows that fit along the edge
        const windowOffset = (wallWidth - windowCount * windowDistance) / 2;
        
        for (let j = 0; j < windowCount; j++) { // j is index of a given window
            const offsetX = Math.cos(angle) * (j * windowDistance + windowOffset + windowDistance / 2);
            const offsetY = Math.sin(angle) * (j * windowDistance + windowOffset + windowDistance / 2);
            windowPoints.push([p1.x + offsetX, p1.y + offsetY, angle]);
        }
    }
    return windowPoints;
}

function genWindows(polygon, backwards) { // backwards reverses the direction of windows
    // NOTE: polygon here is a list of points (does not support inner holes)
    // Get center point of each edge
    let centerPoints = [];
    for (let i = 0; i < polygon.length; i++) {
        let p1 = polygon[i];
        let p2 = polygon[(i + 1) % polygon.length]; // Wrap around for closed polygon
        centerPoints.push([
            p2.x - (p2.x - p1.x) / 2, 
            p2.y - (p2.y - p1.y) / 2
        ]);
    }

    // Expand outwards to find all window locations
    let windowPoints = getWindowPoints(polygon, windowDistance);

    // Place windows model at locations (for now a simple plane)
    let windowGroup = new THREE.Group();
    for (let i = 0; i < windowPoints.length; i++) {
        for (let floorI = 0; floorI < floorCount; floorI++) {
            let p = windowPoints[i];
            if (i % doorMod == 0 && floorI == 0) {
                // Doors
                const doorClone = doorModel.clone(); // Clone the preloaded model
                const stencilGeometry = new THREE.PlaneGeometry(doorWidth, doorHeight);
                const plane = new THREE.Mesh(stencilGeometry, stencilMaterial);
                const angle = p[2];
        
                // Wacky rotations to place window in correct direction
                doorClone.setRotationFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                plane.setRotationFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                const offset = 0;
                if (backwards) {
                    doorClone.rotation.y = angle - Math.PI;
                    plane.rotation.y     = angle - Math.PI;
                } else {
                    doorClone.rotation.y = angle;
                    plane.rotation.y     = angle;
                }
                doorClone.position.set(p[0] + Math.sin(angle)*offset, p[1] - Math.cos(angle)*offset, doorElevation + floorI * floorHeight + doorHeight/2);
                plane.position.set(    p[0] + Math.sin(angle)*offset, p[1] - Math.cos(angle)*offset, doorElevation + floorI * floorHeight + doorHeight/2);
    
                windowGroup.add(doorClone);
                // windowGroup.add(plane);
            } else if (floorI == 0) {
                // Windows
                const windowClone = windowEntranceModel.clone(); // Clone the preloaded model
                const angle = p[2];
        
                // Wacky rotations to place window in correct direction
                windowClone.setRotationFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                let offset = 0;
                if (backwards) {
                    windowClone.rotation.y = angle - Math.PI;
                } else {
                    windowClone.rotation.y = angle;
                }
                windowClone.position.set(p[0] + Math.sin(angle)*offset, p[1] - Math.cos(angle)*offset, windowEntranceElevation + floorI * floorHeight + windowEntranceHeight/2);    
                windowGroup.add(windowClone);
                // windowGroup.add(plane);
            } else {
                // Windows
                const windowClone = windowModel.clone(); // Clone the preloaded model
                const planeGeometry = new THREE.PlaneGeometry(windowWidth, windowHeight);
                const plane = new THREE.Mesh(planeGeometry, stencilMaterial);
                const angle = p[2];
        
                // Wacky rotations to place window in correct direction
                windowClone.setRotationFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                plane.setRotationFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                let offset = 0;
                if (backwards) {
                    windowClone.rotation.y = angle - Math.PI;
                    plane.rotation.y       = angle - Math.PI;
                } else {
                    windowClone.rotation.y = angle;
                    plane.rotation.y       = angle;
                }

                windowClone.position.set(p[0] + Math.sin(angle)*offset, p[1] - Math.cos(angle)*offset, windowElevation + floorI * floorHeight + windowHeight/2);
                plane.position.set(p[0] + Math.sin(angle)*offset, p[1] - Math.cos(angle)*offset, windowElevation + floorI * floorHeight + windowHeight/2);
    
                windowGroup.add(windowClone);
                // windowGroup.add(plane);
            }
        }
    }    
    // Return generated mesh
    return windowGroup;
}

function reverseShape(innerShape) {
    // Reverse the order of curves in the shape
    const reversedCurves = [];
    innerShape.curves.forEach((curve) => {
        const reversedCurve = curve.clone();  // Clone the curve to avoid modifying the original
        // Reverse the order of the points in the curve (start and end)
        reversedCurve.v1 = curve.v2;
        reversedCurve.v2 = curve.v1;
        reversedCurves.push(reversedCurve);
    });
    // Replace the shape's curves with the reversed ones
    innerShape.curves = reversedCurves;
}

function getWallsWithHoles(shape) {
    // Returns a list of meshes
    let wallList = [];
    let extrudeAmount = floorHeight * floorCount;
    let placedWindows = 0;
    for (let i = 0; i < shape.curves.length; i++) {
        // Generate inner shapes
        for (let floorI = 0; floorI < floorCount; floorI++) {
            let cutoutShapes = []
            // Create shape for floor
            const { v1, v2 } = shape.curves[i];
            const width = Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
        
            // Wallpoints
            const wallPoints = [
                { x: -width/2, y: floorI * floorHeight }, 
                { x: -width/2, y: floorI * floorHeight + floorHeight}, 
                { x:  width/2, y: floorI * floorHeight + floorHeight}, 
                { x:  width/2, y: floorI * floorHeight }
            ]
    
            // Define wall shape
            const singleWallShape = new THREE.Shape();
            singleWallShape.moveTo(wallPoints[0].x, wallPoints[0].y);
            singleWallShape.lineTo(wallPoints[1].x, wallPoints[1].y);
            singleWallShape.lineTo(wallPoints[2].x, wallPoints[2].y);
            singleWallShape.lineTo(wallPoints[3].x, wallPoints[3].y);
            singleWallShape.closePath();
        
            // Get window positions
            let windowPoints = [];
            const windowCount = Math.floor(width/windowDistance);
            for (let i = 0; i < windowCount; i++) {
                windowPoints.push({x: windowDistance * i - width/2 + (width - windowDistance * windowCount)/2 + windowDistance/2});
            }    

            for (let i = 0; i < windowPoints.length; i++) {
                let p = windowPoints[i];
                const angle = p[2];
                if (placedWindows % doorMod == 0 && floorI == 0) {
                    // Doors
                    const shape = new THREE.Shape();
                    shape.moveTo(p.x - doorWidth/2, floorI * floorHeight + doorElevation + doorHeight/2 - doorHeight/2);
                    shape.lineTo(p.x - doorWidth/2, floorI * floorHeight + doorElevation + doorHeight/2 + doorHeight/2);
                    shape.lineTo(p.x + doorWidth/2, floorI * floorHeight + doorElevation + doorHeight/2 + doorHeight/2);
                    shape.lineTo(p.x + doorWidth/2, floorI * floorHeight + doorElevation + doorHeight/2 - doorHeight/2);
                    shape.closePath();
                    cutoutShapes.push(shape);
                } else if (floorI == 0) {
                    // Entrance windows
                    const shape = new THREE.Shape();
                    shape.moveTo(p.x - windowEntranceWidth/2, floorI * floorHeight + windowEntranceElevation + windowEntranceHeight/2 - windowEntranceHeight/2);
                    shape.lineTo(p.x - windowEntranceWidth/2, floorI * floorHeight + windowEntranceElevation + windowEntranceHeight/2 + windowEntranceHeight/2);
                    shape.lineTo(p.x + windowEntranceWidth/2, floorI * floorHeight + windowEntranceElevation + windowEntranceHeight/2 + windowEntranceHeight/2);
                    shape.lineTo(p.x + windowEntranceWidth/2, floorI * floorHeight + windowEntranceElevation + windowEntranceHeight/2 - windowEntranceHeight/2);
                    shape.closePath();
                    cutoutShapes.push(shape);
                } else {
                    // Windows
                    const shape = new THREE.Shape();
                    shape.moveTo(p.x - windowWidth/2, floorI * floorHeight + windowElevation + windowHeight/2 - windowHeight/2);
                    shape.lineTo(p.x - windowWidth/2, floorI * floorHeight + windowElevation + windowHeight/2 + windowHeight/2);
                    shape.lineTo(p.x + windowWidth/2, floorI * floorHeight + windowElevation + windowHeight/2 + windowHeight/2);
                    shape.lineTo(p.x + windowWidth/2, floorI * floorHeight + windowElevation + windowHeight/2 - windowHeight/2);
                    shape.closePath();
                    cutoutShapes.push(shape);
                }
                if (floorI == 0) {
                    placedWindows += 1;
                }
            }

            cutoutShapes.forEach(shape => {
                singleWallShape.holes.push(shape)
            });
            
            // Place generated shape at position
            const wallGeometry = new THREE.ShapeGeometry(singleWallShape);
            const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
            if (floorI == 0) {
                wallMesh.material = bottomWallMaterial;
            }
            // Move to correct position
            const centerX = (v1.x + v2.x) / 2;
            const centerY = (v1.y + v2.y) / 2;
            wallMesh.position.set(centerX, centerY, 0);
            const angle = Math.atan2(v2.y - v1.y, v2.x - v1.x);
            wallMesh.setRotationFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
            wallMesh.rotation.y = angle;
            // console.log(wallMesh)
            // wallMesh.up = (x: 0, y: 0, z: 1);
            wallList.push(wallMesh);
        }
    }
    return wallList;
}

// Function to update the 3D projection on the right part of the scene
function update3DProjection() {
    let extrudeAmount = floorHeight * floorCount;
    if (buildingWalls) {
        rightScene.remove(buildingWalls);
    }
    if (previousRoofMesh) {
        rightScene.remove(previousRoofMesh);
    }
    if (previousInnerMeshes) {
        // Remove all previous inner meshes
        previousInnerMeshes.forEach(mesh => rightScene.remove(mesh));
    }
    if (previosRoofSkeleton) {
        rightScene.remove(previosRoofSkeleton);
    }
    if (previosWindowMeshes) {
        rightScene.remove(previosWindowMeshes);
    }

    if (sortedPoints.length > 2) {
        // Step 1: Calculate the centroid of the polygon
        let centroidX = 0;
        let centroidY = 0;
        sortedPoints.forEach((p) => {
            centroidX += p.x;
            centroidY += p.y;
        });
        centroidX /= sortedPoints.length;
        centroidY /= sortedPoints.length;
    
        // Step 2: Adjust all points to center the shape at (0, 0)
        const centeredPoints = sortedPoints.map((p) => ({
            x: p.x - centroidX,
            y: p.y - centroidY
        }));
    
        // Step 3: Create the outer shape (the bigger polygon) using centered points
        const outerShape = new THREE.Shape();
        outerShape.moveTo(centeredPoints[0].x, centeredPoints[0].y);
        centeredPoints.forEach((p) => outerShape.lineTo(p.x, p.y));
        outerShape.lineTo(centeredPoints[0].x, centeredPoints[0].y); // Close the loop
    
        // Step 4: Generate the inner shapes using the updated genInnerShapes function
        const innerShapes = genCourtyardShapes(centeredPoints, deflationFactor);

        // Generate windows
        previosWindowMeshes = genWindows(centeredPoints, false);
        innerShapes.forEach(shape => {
            const polygon = shapeToPolygon(shape);
            const innerPoints = polygon[0].map((p) => ({
                x: p[0],
                y: p[1]
            }));
            const newWindows = genWindows(innerPoints, true);
            previosWindowMeshes.add(newWindows);
        });
        previosWindowMeshes.rotation.x = -Math.PI / 2;

        // Step 5: Add each inner shape as a hole in the outer shape
        innerShapes.forEach((innerShape) => {
            outerShape.holes.push(innerShape);
        });

        // const roofMesh = genRoofMesh(outerShape, extrudeAmount, roofColor);
        // Create roof
        // Construct a polygon extreduded version of our walls (to create a slightly larger roof)
        const roofExtrusion = 50;
        const roofOuterShape  = genCourtyardShapes(centeredPoints, -roofExtrusion)[0];
        const roofInnerShapes = genCourtyardShapes(centeredPoints, deflationFactor + roofExtrusion);
        // Combine into shape
        roofInnerShapes.forEach((innerShape) => {
            roofOuterShape.holes.push(innerShape);
        });

        previosRoofSkeleton = skeletonizeShape(roofOuterShape, extrudeAmount, roofHeight);

        // Step 6: Extrude settings for the outer shape
        const extrudeSettings = {
            depth: extrudeAmount, // Thickness of the extrusion
            bevelEnabled: false, // Disable beveling
        };

        // ------------------------------HOLES IN WALLLS----------------------------------------------------------
        // Create walls with window holes in them
        let wallList = getWallsWithHoles(outerShape); // = new THREE.Group();
        console.log("-----------");
        console.log(outerShape);
        console.log(innerShapes);
        outerShape.holes.forEach((innerShape) => {
            // reverseShape(innerShape); // TODO should not modify actual object, but make a copy!
            wallList.push(...getWallsWithHoles(innerShape));
        });
        // Create group of wallList
        let wallGroup = new THREE.Group();
        wallList.forEach((mesh) => {
            wallGroup.add(mesh);
        });
        wallGroup.rotation.x = -Math.PI / 2;
        
        // outerShape.holes.forEach
        // Step 7: Create the extruded geometry for the outer shape
        const extrudeGeometry = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);

        // Step 9: Create the outer mesh
        buildingWalls = new THREE.Mesh(extrudeGeometry, wallMaterial);
        buildingWalls.rotation.x = -Math.PI / 2;
        // buildingWalls.holes.push(previosWindowMeshes);
        // Step 10: Extrude each inner shape to 3D and store them
        // TODO Remove this (unused)
        const innerMeshes = [];
        const innerMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ff00, // Green color for the inner shapes
            side: THREE.DoubleSide, // Make sure both sides are visible
        });

        innerShapes.forEach((innerShape) => {
            const innerExtrudeGeometry = new THREE.ExtrudeGeometry(innerShape, extrudeSettings);
            const innerMesh = new THREE.Mesh(innerExtrudeGeometry, innerMaterial);
            innerMesh.rotation.x = -Math.PI / 2;
            innerMesh.position.y = 2; // Offset the inner meshes slightly to avoid z-fighting
            innerMeshes.push(innerMesh);
        });

        // Step 11: Add the outer mesh and all inner meshes to the scene
        rightScene.add(previosWindowMeshes);
        buildingWalls = wallGroup;
        rightScene.add(buildingWalls);
        // innerMeshes.forEach(mesh => rightScene.add(mesh));
        // previousRoofMesh = roofMesh;
        // rightScene.add(roofMesh);
        rightScene.add(previosRoofSkeleton);
        // Step 12: Store the inner meshes for removal in the next update
        // previousInnerMeshes = innerMeshes;
    }
}

// Mouse event handlers for left scene
let selectedPoint = null;

function onMouseDown(event) {
    const { offsetX, offsetY, button } = event;
    const mouse = new THREE.Vector2(
        (offsetX / leftContainer.offsetWidth) * 2 - 1,
        -(offsetY / leftContainer.offsetHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, leftCamera);
    const intersects = raycaster.intersectObjects(pointMeshes);

    if (button === 0) {
        if (intersects.length > 0) {
            selectedPoint = intersects[0].object;
        } else {
            const worldCoords = raycaster.ray.at(10, new THREE.Vector3());
            const newPoint = { x: worldCoords.x, y: worldCoords.y };
            points.push(newPoint);
            const newPointMesh = createPoint(newPoint.x, newPoint.y);
            leftScene.add(newPointMesh);
            pointMeshes.push(newPointMesh);
            updatePolygon();
        }
    } else if (button === 2) {
        if (intersects.length > 0) {
            const index = pointMeshes.indexOf(intersects[0].object);
            if (index > -1) {
                leftScene.remove(pointMeshes[index]);
                pointMeshes.splice(index, 1);
                points.splice(index, 1);
                updatePolygon();
            }
        }
    }
}

function resetPointSizes() {
    pointMeshes.forEach(mesh => {
        mesh.scale.set(1, 1, 1); // Reset to default size
    });
}
function onMouseMove(event) {
    const { offsetX, offsetY } = event;
    const mouse = new THREE.Vector2(
        (offsetX / leftContainer.offsetWidth) * 2 - 1,
        -(offsetY / leftContainer.offsetHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, leftCamera);
    const intersects = raycaster.intersectObjects(pointMeshes);

    if (intersects.length === 0) {
        if (hoveredPoint) {
            resetPointSizes();
            hoveredPoint = null;
        }
    } else {
        const intersectedPoint = intersects[0].object;
        if (hoveredPoint !== intersectedPoint) {
            resetPointSizes();
            let r = 2
            intersectedPoint.scale.set(r, r, r);
            hoveredPoint = intersectedPoint;
        }
    }

    if (selectedPoint) {
        const worldCoords = raycaster.ray.at(10, new THREE.Vector3());
        selectedPoint.position.set(worldCoords.x, worldCoords.y, 0);
        const index = pointMeshes.indexOf(selectedPoint);
        if (index > -1) {
            points[index].x = worldCoords.x;
            points[index].y = worldCoords.y;
            updatePolygon();
        }
    }
}

let mouseHeld = false;
let oldMouseX = null;
let oldMouseY = null;
function onMouseDown3d(event) {
    mouseHeld = true;
}

function onMouseMove3d(event) {
    // Function to rotate camera
    if (mouseHeld) {
        const dx = event.x - oldMouseX;
        const dy = event.y - oldMouseY;
        horisontalAngle += dx / 100;
        verticalAngle   += dy / 100;
    }
    verticalAngle = Math.min(Math.PI / 2, verticalAngle);
    verticalAngle = Math.max(0.01, verticalAngle);

    oldMouseX = event.x;
    oldMouseY = event.y;
}

function onMouseUp3d(event) {
    mouseHeld = false;
}

function onMouseScroll3d(event) {
    event.preventDefault();
    cameraRadius += event.deltaY / 10;
    onMouseMove3d();
}


function onMouseUp() {
    selectedPoint = null;
    updatePolygon();
}

leftContainer.addEventListener('mousedown', onMouseDown);
leftContainer.addEventListener('mousemove', onMouseMove);
leftContainer.addEventListener('mouseup', onMouseUp);
leftContainer.addEventListener('contextmenu', event => event.preventDefault());

rightContainer.addEventListener('mousedown', onMouseDown3d);
rightContainer.addEventListener('mousemove', onMouseMove3d);
rightContainer.addEventListener('mouseup', onMouseUp3d);
rightContainer.addEventListener('wheel', onMouseScroll3d);

let cameraRadius = 100;
let horisontalAngle = 0; // Initial angle
let verticalAngle   = 0.1;

function animate() {
    // Make the cameras look at the center (0, 0, 0)
    rightCamera.position.x = cameraRadius * Math.cos(horisontalAngle) * Math.cos(verticalAngle);
    rightCamera.position.y = cameraRadius * Math.sin(verticalAngle);
    rightCamera.position.z = cameraRadius * Math.sin(horisontalAngle) * Math.cos(verticalAngle);
    rightCamera.lookAt(0, 0, 0);

    // Render the scenes
    leftRenderer.render(leftScene, leftCamera);
    rightRenderer.render(rightScene, rightCamera);

    // Request the next frame
    requestAnimationFrame(animate);
}

animate();
