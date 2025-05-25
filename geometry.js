import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as turf from '@turf/turf';
import earcut from "earcut"; // Used for triangulation of skeletonisation
import {SkeletonBuilder} from 'straight-skeleton';


export function ensureCounterClockwise(points) {
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

export function ensureClockwise(points) {
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

export function polySort(points) {
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

export function genCourtyardShapes(points, deflationFactor) {
    // Given a list of points, generates a deflated polygon shape using Turf.js.
    const coordinates = points.map(p => [p.x, p.y]);
    const polygon = turf.polygon([[...coordinates, coordinates[0]]]);
    const offsetPolygon = turf.buffer(polygon, -deflationFactor);
    if (!offsetPolygon || turf.area(offsetPolygon) <= 0) {
        return []; // Return empty array if the deflation is too high or the polygon is invalid
    }
    // Handle multiple inner shapes (MultiPolygon)
    const geometries = offsetPolygon.geometry.type === 'MultiPolygon' 
        ? offsetPolygon.geometry.coordinates 
        : [offsetPolygon.geometry.coordinates];
    // Convert each inner polygon into a THREE.Shape
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

export function shapeToPolygon(shape) {
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

export function skeletonizeShape(shape, elevation, roofHeight, roofColor) {    // Inflate shape slightly to create overhang
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