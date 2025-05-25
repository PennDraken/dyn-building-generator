// to start server:
// npx vite 
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as turf from '@turf/turf';
import earcut from "earcut"; // Used for triangulation of skeletonisation
import {SkeletonBuilder} from 'straight-skeleton';
import { 
    shapeToPolygon, ensureCounterClockwise, ensureClockwise, 
    polySort, genCourtyardShapes, skeletonizeShape 
} from '/geometry.js';
import {Building} from '/building.js';

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

const loader = new GLTFLoader();
let windowModel = await loader.loadAsync('models/window1.glb').then(gltf => gltf.scene);
let doorModel = await loader.loadAsync('models/door1.glb').then(gltf => gltf.scene);
let windowEntranceModel = await loader.loadAsync('models/window-entrance1.glb').then(gltf => gltf.scene);

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

const changeBuildingButton = document.getElementById("change-building-button");
const selectedBuildingLabel = document.getElementById("selected-building-label");

// Init building properties
let floorCount      = parseFloat(floorCountSlider.value);
let floorHeight     = parseFloat(floorHeightSlider.value);
let deflationFactor = parseFloat(deflationFactorSlider.value);
let roofHeight      = parseFloat(roofHeightSlider.value);
let windowDistance  = 3; //parseFloat(windowDistanceDisplay.value); This does not work for some reason TODO fix this!

// Add an event listener to the slider to update the value
deflationFactorSlider.addEventListener("input", () => {
    deflationFactor = parseFloat(deflationFactorSlider.value);
    selectedBuilding.deflationAmount = deflationFactor;
    deflationFactorDisplay.textContent = deflationFactor.toFixed(2);
    update3DProjection();
});

floorHeightSlider.addEventListener("input", () => {
    floorHeight = parseFloat(floorHeightSlider.value);
    selectedBuilding.floorHeight = floorHeight;
    floorHeightDisplay.textContent = floorHeight.toFixed(2);
    update3DProjection();
});

floorCountSlider.addEventListener("input", () => {
    floorCount = parseFloat(floorCountSlider.value);
    selectedBuilding.floorCount = floorCount;
    floorCountDisplay.textContent = floorCount.toFixed(2);
    update3DProjection();
});

roofHeightSlider.addEventListener("input", () => {
    roofHeight = parseFloat(roofHeightSlider.value);
    selectedBuilding.roofHeight = roofHeight;
    roofHeightDisplay.textContent = roofHeight.toFixed(2);
    update3DProjection();
});

windowDistanceSlider.addEventListener("input", () => {
    windowDistance = parseFloat(windowDistanceSlider.value);
    selectedBuilding.windowDistance = windowDistance;
    windowDistanceDisplay.textContent = windowDistance.toFixed(2);
    update3DProjection();
});


let buildings = [];
let selectedBuilding = new Building(
  [{x:0,y:0},{x:3,y:3},{x:0,y:3},{x:0,y:0}], 
  deflationFactor, 
  floorHeight, 
  floorCount, 
  roofHeight, 
  windowDistance, 
  doorModel, 
  windowModel, 
  windowEntranceModel
);
buildings.push(selectedBuilding);

function setSelectedBuilding() {

}

changeBuildingButton.addEventListener("click", () => {
    console.log("Changed building")
    // Increase index of selected building
    const i = buildings.indexOf(selectedBuilding) + 1;
    // Check if i-1 is unitialized (go back to index 0)
    if (buildings[i-1].polygon.length<=2) {
        i = 0;
        selectedBuilding = buildings[i]
        unsortedPoints = selectedBuilding.polygon;
        updateSelectedPolygon()
        selectedBuildingLabel.innerHTML = i;
    }

    // Create new building if outside of range
    else if (i > buildings.length) {
        // Create temp building
        let newBuilding = new Building(
            [{x:0,y:0}], 
            deflationFactor, 
            floorHeight, 
            floorCount, 
            roofHeight, 
            windowDistance, 
            doorModel, 
            windowModel, 
            windowEntranceModel
        );
        buildings.push(newBuilding);
        selectedBuilding = newBuilding
        unsortedPoints = selectedBuilding.polygon;
        updateSelectedPolygon()
        selectedBuildingLabel.innerHTML = i;
    } else {
        selectedBuilding = buildings[i]
        unsortedPoints = selectedBuilding.polygon;
        updateSelectedPolygon()
        selectedBuildingLabel.innerHTML = i;
    }
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
let unsortedPoints = [];
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
function createPoint(x, y, pointRadius = 1.2) {
    const geometry = new THREE.CircleGeometry(pointRadius, 8);
    const point = new THREE.Mesh(geometry, pointMaterial);
    point.position.set(x, y, 0);
    return point;
}

function updateSelectedPolygon() {
    let sortedPoints = polySort(unsortedPoints); // Sort the points in counter-clockwise order (ie creates a non-intersecting polygon)
    selectedBuilding.polygon = sortedPoints;
    // sortedPoints = points;
    if (polygon) {
        leftScene.remove(polygon);
    }
    if (unsortedPoints.length > 2) {
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

function genWindows(polygon, backwards, windowModel, windowEntranceModel, doorModel) { // backwards reverses the direction of windows
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
            wallList.push(wallMesh);
        }
    }
    return wallList;
}

function buildingToMesh(building) {
    // Converts a building into a 3.mesh group
    let extrudeAmount = building.floorHeight * building.floorCount;

    if (building.polygon.length <= 2) {return None} // Early return for invalid shapes
    
    // Calculate the centroid of the polygon
    let centroidX = 0;
    let centroidY = 0;
    building.polygon.forEach((p) => {
        centroidX += p.x;
        centroidY += p.y;
    });
    centroidX /= building.polygon.length;
    centroidY /= building.polygon.length;

    // Adjust all points to center the shape at (0, 0)
    const centeredPoints = building.polygon.map((p) => ({
        x: p.x ,//- centroidX,
        y: p.y  //- centroidY
    }));

    // Create the outer shape (the bigger polygon) using centered points
    const outerShape = new THREE.Shape();
    outerShape.moveTo(centeredPoints[0].x, centeredPoints[0].y);
    centeredPoints.forEach((p) => outerShape.lineTo(p.x, p.y));
    outerShape.lineTo(centeredPoints[0].x, centeredPoints[0].y); // Close the loop

    // Generate the inner shapes (holes)
    const innerShapes = genCourtyardShapes(centeredPoints, building.deflationAmount);

    // Generate windows
    let previosWindowMeshes = genWindows(centeredPoints, false, windowModel, windowEntranceModel, doorModel);
    innerShapes.forEach(shape => {
        const polygon = shapeToPolygon(shape);
        const innerPoints = polygon[0].map((p) => ({
            x: p[0],
            y: p[1]
        }));
        const newWindows = genWindows(innerPoints, true, windowModel, windowEntranceModel, doorModel);
        previosWindowMeshes.add(newWindows);
    });
    previosWindowMeshes.rotation.x = -Math.PI / 2;

    // Add each inner shape as a hole in the outer shape
    innerShapes.forEach((innerShape) => {
        outerShape.holes.push(innerShape);
    });

    // Create roof
    // Construct a polygon extreduded version of our walls (to create a slightly larger roof)
    const roofExtrusion = 50;
    const roofOuterShape  = genCourtyardShapes(centeredPoints, -roofExtrusion)[0];
    const roofInnerShapes = genCourtyardShapes(centeredPoints, deflationFactor + roofExtrusion);
    // Combine into shape
    roofInnerShapes.forEach((innerShape) => {
        roofOuterShape.holes.push(innerShape);
    });

    const previosRoofSkeleton = skeletonizeShape(roofOuterShape, extrudeAmount, roofHeight, roofColor);

    // Step 6: Extrude settings for the outer shape (how tall the walls should be)
    const extrudeSettings = {
        depth: extrudeAmount, // Thickness of the extrusion
        bevelEnabled: false, // Disable beveling
    };

    // ------------------------------HOLES IN WALLLS----------------------------------------------------------
    // Create walls with window holes in them
    let wallList = getWallsWithHoles(outerShape); // = new THREE.Group();
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

    // Adding meshes to scene
    buildingWalls = wallGroup;
    let buildingGroup = new THREE.Group();
    buildingGroup.add(previosWindowMeshes)
    buildingGroup.add(buildingWalls)
    buildingGroup.add(previosRoofSkeleton)
    console.log("Here!")
    return buildingGroup
}

// Function to update the 3D projection on the right part of the scene
function update3DProjection() {
    const oldMesh = rightScene.getObjectByName('building');
    if (oldMesh) {
        rightScene.remove(oldMesh);
        oldMesh.geometry?.dispose();
        if (Array.isArray(oldMesh.material)) {
            oldMesh.material.forEach(m => m.dispose());
        } else {
            oldMesh.material?.dispose();
        }
    }
    console.log("Adding building now");
    console.log(selectedBuilding)
    const mesh = buildingToMesh(selectedBuilding);
    mesh.name = 'building';
    rightScene.add(mesh);
    console.log("Here!");
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
            unsortedPoints.push(newPoint);
            const newPointMesh = createPoint(newPoint.x, newPoint.y, pointRadius);
            leftScene.add(newPointMesh);
            pointMeshes.push(newPointMesh);
            updateSelectedPolygon();
        }
    } else if (button === 2) {
        // Delete point
        if (intersects.length > 0) {
            const index = pointMeshes.indexOf(intersects[0].object);
            if (index > -1) {
                leftScene.remove(pointMeshes[index]);
                pointMeshes.splice(index, 1);
                unsortedPoints.splice(index, 1);
                updateSelectedPolygon();
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
            unsortedPoints[index].x = worldCoords.x;
            unsortedPoints[index].y = worldCoords.y;
            updateSelectedPolygon();
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
    updateSelectedPolygon();
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
