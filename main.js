import * as THREE from 'three';

// Select containers for left and right sides
const leftContainer = document.getElementById('left');

// Set up the scene, camera, and renderer for the left side
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(
    -10, 10, 10, -10, 0.1, 1000
);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(leftContainer.offsetWidth, leftContainer.offsetHeight);
leftContainer.appendChild(renderer.domElement);

// Adjust camera and renderer on window resize
function onWindowResize() {
    const aspect = leftContainer.offsetWidth / leftContainer.offsetHeight;

    // Adjust the orthographic camera view size
    const viewSize = 10; // Fixed world size
    camera.left = -viewSize * aspect;
    camera.right = viewSize * aspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;

    camera.updateProjectionMatrix();
    renderer.setSize(leftContainer.offsetWidth, leftContainer.offsetHeight);
}

// Add event listener for window resize
window.addEventListener('resize', onWindowResize);

// Variables for interactive points and polygon
let points = [];
let pointMeshes = [];
let polygon = null;

// Material for points and lines
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });

// Function to create a point mesh
function createPoint(x, y) {
    const geometry = new THREE.CircleGeometry(0.2, 32);
    const point = new THREE.Mesh(geometry, pointMaterial);
    point.position.set(x, y, 0);
    return point;
}

// Function to update the polygon based on points
function updatePolygon() {
    if (polygon) {
        scene.remove(polygon);
    }

    if (points.length > 2) {
        const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.y)));
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
        });
        polygon = new THREE.Mesh(geometry, material);
        scene.add(polygon);
    }
}

// Handle mouse events
let selectedPoint = null;

function onMouseDown(event) {
    const { offsetX, offsetY, button } = event;
    const mouse = new THREE.Vector2(
        (offsetX / leftContainer.offsetWidth) * 2 - 1,
        -(offsetY / leftContainer.offsetHeight) * 2 + 1
    );

    // Convert mouse coordinates to world space
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(pointMeshes);

    if (button === 0) {
        // Left click: Add or select point
        if (intersects.length > 0) {
            selectedPoint = intersects[0].object;
        } else {
            // Add new point
            const worldCoords = raycaster.ray.at(10, new THREE.Vector3());
            const newPoint = { x: worldCoords.x, y: worldCoords.y };
            points.push(newPoint);
            const newPointMesh = createPoint(newPoint.x, newPoint.y);
            scene.add(newPointMesh);
            pointMeshes.push(newPointMesh);
            updatePolygon();
        }
    } else if (button === 2) {
        // Right click: Remove point
        if (intersects.length > 0) {
            const index = pointMeshes.indexOf(intersects[0].object);
            if (index > -1) {
                scene.remove(pointMeshes[index]);
                pointMeshes.splice(index, 1);
                points.splice(index, 1);
                updatePolygon();
            }
        }
    }
}

function onMouseMove(event) {
    if (!selectedPoint) return;

    const { offsetX, offsetY } = event;
    const mouse = new THREE.Vector2(
        (offsetX / leftContainer.offsetWidth) * 2 - 1,
        -(offsetY / leftContainer.offsetHeight) * 2 + 1
    );

    // Convert mouse coordinates to world space
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const worldCoords = raycaster.ray.at(10, new THREE.Vector3());

    // Move the selected point
    selectedPoint.position.set(worldCoords.x, worldCoords.y, 0);
    const index = pointMeshes.indexOf(selectedPoint);
    if (index > -1) {
        points[index].x = worldCoords.x;
        points[index].y = worldCoords.y;
        updatePolygon();
    }
}

function onMouseUp() {
    selectedPoint = null;
}

// Add event listeners
leftContainer.addEventListener('mousedown', onMouseDown);
leftContainer.addEventListener('mousemove', onMouseMove);
leftContainer.addEventListener('mouseup', onMouseUp);
leftContainer.addEventListener('contextmenu', event => event.preventDefault()); // Disable right-click context menu

// Render loop
function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
animate();
