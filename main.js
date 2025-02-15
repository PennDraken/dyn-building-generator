import * as THREE from 'three';
import * as turf from '@turf/turf';

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
    color: 0xffffff,  // White color
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
const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Adjust intensity to a more moderate value
directionalLight.position.set(1, 1, 1); // Position of the light in the 3D space
rightScene.add(directionalLight);

// Optional: Add ambient light for softer lighting (providing basic light throughout the scene)
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Soft white light with moderate intensity
rightScene.add(ambientLight);


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
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
const polygonMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
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

    update3DProjection();
}
let previousInnerMesh = null;
// Function to update the 3D projection on the right part of the scene
function genInnerShape(points, deflationFactor) {
    // Step 1: Convert the points into a Turf.js polygon
    const coordinates = points.map(p => [p.x, p.y]);
    const polygon = turf.polygon([[...coordinates, coordinates[0]]]);

    // Step 2: Use Turf.js to create a buffer around the polygon
    // Negative value for deflation (shrink the polygon)
    const offsetPolygon = turf.buffer(polygon, -100);

    // Step 3: Extract the coordinates of the offset polygon
    const offsetCoordinates = offsetPolygon.geometry.coordinates[0];

    // Step 4: Create the inner shape (the smaller polygon)
    const innerShape = new THREE.Shape();
    innerShape.moveTo(offsetCoordinates[0][0], offsetCoordinates[0][1]);
    offsetCoordinates.forEach((coord) => innerShape.lineTo(coord[0], coord[1]));
    innerShape.lineTo(offsetCoordinates[0][0], offsetCoordinates[0][1]); // Close the loop

    return innerShape;
}

function update3DProjection() {
    if (projectedPolygon) {
        rightScene.remove(projectedPolygon);
    }

    if (previousInnerMesh) {
        rightScene.remove(previousInnerMesh);  // Remove the previous inner mesh
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

        // Step 2: Define a deflation factor (e.g., 0.5 means 50% shrinkage)
        const deflationFactor = 0.5;

        // Step 3: Create the outer shape (the bigger polygon)
        const outerShape = new THREE.Shape();
        outerShape.moveTo(points[0].x, points[0].y);
        points.forEach((p) => outerShape.lineTo(p.x, p.y));
        outerShape.lineTo(points[0].x, points[0].y); // Close the loop

        // Step 4: Generate the inner shape using the genInnerShape function
        const innerShape = genInnerShape(points, deflationFactor);

        // Step 5: Add the inner shape as a hole in the outer shape
        outerShape.holes.push(innerShape);

        // Step 6: Extrude settings for the outer shape
        const extrudeSettings = {
            depth: 2, // Thickness of the extrusion
            bevelEnabled: false, // Disable beveling
        };

        // Step 7: Create the extruded geometry for the outer shape
        const extrudeGeometry = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);

        // Step 8: Material for the outer 3D object
        const outerMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000, // Red color for the outer shape
            side: THREE.DoubleSide, // Make sure both sides are visible
        });

        // Step 9: Create the outer mesh
        projectedPolygon = new THREE.Mesh(extrudeGeometry, outerMaterial);
        projectedPolygon.rotation.x = -Math.PI / 2;

        // Step 10: Extrude the inner shape to 3D
        const innerExtrudeGeometry = new THREE.ExtrudeGeometry(innerShape, extrudeSettings);
        const innerMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ff00, // Green color for the inner shape
            side: THREE.DoubleSide, // Make sure both sides are visible
        });

        // Step 11: Create the inner mesh (extruded)
        const innerMesh = new THREE.Mesh(innerExtrudeGeometry, innerMaterial);
        innerMesh.rotation.x = -Math.PI / 2;
        innerMesh.position.y = 2;

        // Step 12: Add both meshes to the scene
        rightScene.add(projectedPolygon);
        // rightScene.add(innerMesh);

        // previousInnerMesh = innerMesh;
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
            intersectedPoint.scale.set(1.5, 1.5, 1.5);
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
        projectedPolygon.rotation.z += 0.01; // Adjust the value to control the speed of rotation
    }

    // Render the scenes
    leftRenderer.render(leftScene, leftCamera);
    rightRenderer.render(rightScene, rightCamera);

    // Request the next frame
    requestAnimationFrame(animate);
}
animate();
