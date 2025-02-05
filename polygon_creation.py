import random
import matplotlib.pyplot as plt
from shapely.geometry import Polygon, LineString
from shapely.ops import polygonize

# Create a list of points
points = [(3, 2), (0, 1), (0, 2), (5, 3)]

# Define edges (lines between points)
edges = [
    LineString([points[0], points[1]]),
    LineString([points[1], points[2]]),
    LineString([points[2], points[3]]),
    LineString([points[3], points[0]])
]

# Use polygonize to form a polygon from the edges
polygon = list(polygonize(edges))[0]  # polygonize returns an iterator, so we take the first polygon

# Plot the polygon
x, y = polygon.exterior.xy
plt.plot(x, y, color="blue")
plt.fill(x, y, color="lightblue", alpha=0.5)

# Show the plot
plt.title("Shapely Polygon")
plt.grid(True)
plt.show()
