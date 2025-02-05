import random
import matplotlib.pyplot as plt
from shapely.geometry import Polygon

# Generate random points
n = random.randint(4, 5)  # Random number of points between 4 and 10
points = [(random.uniform(-1, 1), random.uniform(-1, 1)) for _ in range(n)]

# Create the polygon
polygon = Polygon(points)

# Inward offset by 0.1 units
offset_polygon = polygon.buffer(-0.1)

# Create the plot
fig, ax = plt.subplots()

# Plot original polygon
x, y = polygon.exterior.xy
ax.fill(x, y, alpha=0.5, fc='blue', label='Original Polygon')

# Plot offset polygon
x_offset, y_offset = offset_polygon.exterior.xy
ax.fill(x_offset, y_offset, alpha=0.5, fc='red', label='Inward Offset Polygon')

# Display the plot
ax.set_title("Random Polygon with Inward Offset")
ax.legend()
plt.show()
