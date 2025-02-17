// to start server:
// npx vite 
import * as THREE from 'three';
import * as turf from '@turf/turf';
import earcut from "earcut"; // Used for triangulation of skeletonisation
import { deflate } from 'three/examples/jsm/libs/fflate.module.js';
import {SkeletonBuilder} from 'straight-skeleton';
SkeletonBuilder.init();
SkeletonBuilder.init().catch((error) => {
    console.error("Failed to initialize SkeletonBuilder:", error);
});

// Colors
const wallColor = 0xDAC6C6;
const bluePrintColor = 0xDAC6C6;
const groundColor = 0x4D6C50;
const pointsColor = 0xE1E1E1;
const roofColor = 0xcc3300;

// Select containers for left and right sides
const leftContainer = document.getElementById('left');
const rightContainer = document.getElementById('right');

// Set up the scene, camera, and renderer for the left side
const leftScene = new THREE.Scene();
const leftCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
leftCamera.position.z = 10;

const leftRenderer = new THREE.WebGLRenderer();
leftRenderer.setSize(leftContainer.offsetWidth, leftContainer.offsetHeight);
leftContainer.appendChild(leftRenderer.domElement);

// Set up the scene, camera, and renderer for the right side
const rightScene = new THREE.Scene();
const rightCamera = new THREE.PerspectiveCamera(75, rightContainer.offsetWidth / rightContainer.offsetHeight, 0.1, 1000);
rightCamera.position.set(5, 10, 10);
rightCamera.lookAt(0, 0, 0);

// Ground plane
const planeGeometry = new THREE.PlaneGeometry(100, 100);
const planeMaterial = new THREE.MeshBasicMaterial({
    color: groundColor,  // White color
    side: THREE.DoubleSide,  // Make the plane visible from both sides
    opacity: 0.5,  // Optional: Adjust transparency if needed
    transparent: true
});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = - Math.PI / 2;
plane.position.set(0, 0, 0);
rightScene.add(plane);

const rightRenderer = new THREE.WebGLRenderer();
rightRenderer.setSize(rightContainer.offsetWidth, rightContainer.offsetHeight);
rightContainer.appendChild(rightRenderer.domElement);

// Add a directional light to the rightScene
const directionalLight = new THREE.DirectionalLight(0xffffff, 3); // Adjust intensity to a more moderate value
directionalLight.position.set(1, 1, 1); // Position of the light in the 3D space
rightScene.add(directionalLight);

// Optional: Add ambient light for softer lighting (providing basic light throughout the scene)
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Soft white light with moderate intensity
rightScene.add(ambientLight);

// Get references to the slider and value display
const slider = document.getElementById("deflationFactorSlider");
const sliderValueDisplay = document.getElementById("deflationFactorValue");

// Add an event listener to the slider to update the value
slider.addEventListener("input", () => {
    const deflationFactor = parseFloat(slider.value);
    sliderValueDisplay.textContent = deflationFactor.toFixed(2); // Update displayed value
    update3DProjection(deflationFactor); // Pass the value to your function
});

let deflationFactor = 40;
window.onload = () => {
    const initialDeflationFactor = parseFloat(slider.value);
    deflationFactor = initialDeflationFactor;
};


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
let pointMeshes = [];
let polygon = null;
let hoveredPoint = null;

// Right-side 3D polygon
let projectedPolygon = null;

// Material for points and lines
const pointMaterial = new THREE.MeshBasicMaterial({ color: pointsColor });
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
const polygonMaterial = new THREE.MeshBasicMaterial({
    color: bluePrintColor,
    side: THREE.DoubleSide,
    wireframe: false,
});

// Function to create a point mesh
function createPoint(x, y) {
    const geometry = new THREE.CircleGeometry(0.2, 32);
    const point = new THREE.Mesh(geometry, pointMaterial);
    point.position.set(x, y, 0);
    return point;
}

// Function to update the 2D polygon on the left
function updatePolygon() {
    if (polygon) {
        leftScene.remove(polygon);
    }

    if (points.length > 2) {
        const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.y)));
        const geometry = new THREE.ShapeGeometry(shape);
        polygon = new THREE.Mesh(geometry, polygonMaterial);
        leftScene.add(polygon);
    }

    update3DProjection(parseFloat(slider.value));
}
let previousInnerMeshes = [];
let previousRoofMesh = null;
let previosRoofSkeleton = null;
function genCourtyardShapes(points, deflationFactor) {
    // Step 1: Convert the points into a Turf.js polygon
    const coordinates = points.map(p => [p.x, p.y]);
    const polygon = turf.polygon([[...coordinates, coordinates[0]]]);

    // Step 2: Use Turf.js to create a buffer around the polygon
    // Negative value for deflation (shrink the polygon)
    const offsetPolygon = turf.buffer(polygon, -deflationFactor);

    // Step 3: Handle multiple inner shapes (MultiPolygon)
    const geometries = offsetPolygon.geometry.type === 'MultiPolygon' 
        ? offsetPolygon.geometry.coordinates 
        : [offsetPolygon.geometry.coordinates];

    // Step 4: Convert each inner polygon into a THREE.Shape
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

function skeletonizeShape(outerShapes, innerShapes, elevation) {
    // Transformation to 3.js based on https://github.com/StrandedKitty/straight-skeleton/blob/main/src/example/index.ts
    const polygon = [
        [
            [-1, -1],
            [0, -12],
            [1, -1],
            [12, 0],
            [1, 1],
            [0, 12],
            [-1, 1],
            [-12, 0],
            [-1, -1]
        ], [
            [-1, 0],
            [0, 1],
            [1, 0],
            [0, -1],
            [-1, 0]
        ]
    ];

    // Generate the skeleton mesh using the polygon
    const result = SkeletonBuilder.buildFromPolygon(polygon);
    // console.log(result);
    // Extract vertices and polygons from the result object
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const scale = 1;

    for (const polygon of result.polygons) {
        const polygonVertices = [];

        for (let i = 0; i < polygon.length; i++) {
            const vertex = result.vertices[polygon[i]];
            polygonVertices.push(
                (vertex[0]) * scale,
                (vertex[1]) * scale,
                (vertex[2]) * scale
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

    const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,   // Green color for the mesh
        wireframe: false    // Wireframe mode to visualize the polygons clearly
    });
    const skeletonMesh = new THREE.Mesh(geometry, material);

    skeletonMesh.position.y = 2*elevation;
    skeletonMesh.rotation.x = -Math.PI / 2;
    return skeletonMesh;
}


function genRoofMesh(buildingShape, elevation, roofColor) {
    // Ensure the input is a valid THREE.Shape
    if (!(buildingShape instanceof THREE.Shape)) {
        throw new Error("Invalid building shape: Must be an instance of THREE.Shape.");
    }

    // Generate the geometry for the roof using shape geometry
    const shapeGeometry = new THREE.ShapeGeometry(buildingShape);

    // Create a material for the roof
    const material = new THREE.MeshStandardMaterial({ color: roofColor, side: THREE.DoubleSide, wireframe: true });

    // Create the roof mesh
    const roofMesh = new THREE.Mesh(shapeGeometry, material);

    // Compute the bounding box of the building shape to determine its height
    const boundingBox = new THREE.Box3().setFromObject(roofMesh);
    const buildingHeight = boundingBox.max.z - boundingBox.min.z;

    // Elevate the roof by the specified amount above the building height
    roofMesh.position.y = buildingHeight + elevation;
    roofMesh.rotation.x = -Math.PI / 2;
    return roofMesh;
}

// Function to update the 3D projection on the right part of the scene
function update3DProjection(deflationFactor) {
    let extrudeAmount = 2;

    if (projectedPolygon) {
        rightScene.remove(projectedPolygon);
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
    
    if (points.length > 2) {
        // Step 1: Calculate the centroid of the polygon
        let centroidX = 0;
        let centroidY = 0;
        points.forEach((p) => {
            centroidX += p.x;
            centroidY += p.y;
        });
        centroidX /= points.length;
        centroidY /= points.length;

        // Step 3: Create the outer shape (the bigger polygon)
        const outerShape = new THREE.Shape();
        outerShape.moveTo(points[0].x, points[0].y);
        points.forEach((p) => outerShape.lineTo(p.x, p.y));
        outerShape.lineTo(points[0].x, points[0].y); // Close the loop

        // Step 4: Generate the inner shapes using the updated genInnerShapes function
        const innerShapes = genCourtyardShapes(points, deflationFactor);
        previosRoofSkeleton = skeletonizeShape(outerShape, innerShapes, extrudeAmount + 0.5);

        // Step 5: Add each inner shape as a hole in the outer shape
        innerShapes.forEach((innerShape) => {
            outerShape.holes.push(innerShape);
        });

        // Create roof
        const roofMesh = genRoofMesh(outerShape, extrudeAmount + 0.1, roofColor);
        
        // Step 6: Extrude settings for the outer shape
        const extrudeSettings = {
            depth: extrudeAmount, // Thickness of the extrusion
            bevelEnabled: false, // Disable beveling
        };

        // Step 7: Create the extruded geometry for the outer shape
        const extrudeGeometry = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);

        // Step 8: Material for the outer 3D object
        const outerMaterial = new THREE.MeshPhongMaterial({
            color: wallColor, // Red color for the outer shape
            side: THREE.DoubleSide, // Make sure both sides are visible
        });

        // Step 9: Create the outer mesh
        projectedPolygon = new THREE.Mesh(extrudeGeometry, outerMaterial);
        projectedPolygon.rotation.x = -Math.PI / 2;

        // Step 10: Extrude each inner shape to 3D and store them
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
        rightScene.add(projectedPolygon);
        // innerMeshes.forEach(mesh => rightScene.add(mesh));
        previousRoofMesh = roofMesh;
        rightScene.add(roofMesh);
        rightScene.add(previosRoofSkeleton);

        // Step 12: Store the inner meshes for removal in the next update
        // previousInnerMeshes = innerMeshes;
    }
}
// Mouse events and rendering loop (same as your code)

// Mouse event handlers for left scene (same as your existing code)
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



function onMouseUp() {
    selectedPoint = null;
}

leftContainer.addEventListener('mousedown', onMouseDown);
leftContainer.addEventListener('mousemove', onMouseMove);
leftContainer.addEventListener('mouseup', onMouseUp);
leftContainer.addEventListener('contextmenu', event => event.preventDefault());

// Render loop
function animate() {
    // Rotate the projected polygon around the Z-axis
    if (projectedPolygon) {
        // projectedPolygon.rotation.z += 0.01; // Adjust the value to control the speed of rotation
    }

    // Render the scenes
    leftRenderer.render(leftScene, leftCamera);
    rightRenderer.render(rightScene, rightCamera);

    // Request the next frame
    requestAnimationFrame(animate);
}
animate();
