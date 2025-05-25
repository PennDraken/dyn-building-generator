import * as turf from '@turf/turf';
import * as THREE from 'three';

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

