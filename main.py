import pygame
import math
import shapely

# Initialize pygame
pygame.init()

# Constants
WIDTH, HEIGHT = 800, 600
BG_COLOR = (30, 30, 30)
POINT_COLOR = (255, 0, 0)
EDGE_COLOR = (200, 200, 200)
POINT_RADIUS = 16

# Pygame setup
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Draggable Points with Non-Intersecting Polygon")
clock = pygame.time.Clock()

# Data structures
points = []
dragging_point = None


def get_point_at_pos(pos):
    """ Return the point index if pos is near a point. """
    for i, p in enumerate(points):
        if (p[0] - pos[0])**2 + (p[1] - pos[1])**2 <= POINT_RADIUS**2:
            return i
    return None


def squared_polar(point, center):
    """ Convert point to polar coordinates centered at 'center'. Return [angle, squared_distance]. """
    dx, dy = point[0] - center[0], point[1] - center[1]
    angle = math.atan2(dy, dx)
    squared_distance = dx**2 + dy**2
    return [angle, squared_distance]


def poly_sort(points):
    """ Sort points in counter-clockwise order based on polar angle from the center of mass. """
    # Calculate the center of mass
    center = [sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)]
    
    # Annotate each point with polar coordinates (angle, squared distance)
    annotated_points = []
    for point in points:
        polar = squared_polar(point, center)
        annotated_points.append(point + tuple(polar))  # Convert polar to tuple before concatenation
    
    # Sort by angle first, then by squared distance
    annotated_points.sort(key=lambda p: (p[2], p[3]))
    
    # Remove temporary polar data
    sorted_points = [p[:2] for p in annotated_points]
    return sorted_points


def generate_edges(points):
    """ Generate the edges of the polygon. """
    if len(points) >= 3:
        sorted_points = poly_sort(points)
        edges = []
        for i in range(len(sorted_points)):
            start_point = sorted_points[i]
            end_point = sorted_points[(i + 1) % len(sorted_points)]
            edges.append((start_point, end_point))
        return edges
    return []

def inset_edges(points, edges, inset_amount):
    """ Insets a list of points. Returns a new list of points"""
    # First we find center point
    if len(points)>=3:
        linestring_edges = [shapely.LineString(edge) for edge in edges] # Required to fit format for polygonize
        polygon = shapely.polygonize(linestring_edges)
        inset_polygon = polygon.buffer(-inset_amount)
        # Check if the result is a valid polygon or a MultiPolygon
        if inset_polygon.is_valid:
            inset_points = [list(inset_polygon.exterior.coords)]
        else:
            # If it's a MultiPolygon, we need to extract the exterior coordinates from each part
            inset_points = []
            for part in inset_polygon.geoms:
                inset_points.append(list(part.exterior.coords))
        return inset_points
    return []



def main():
    global dragging_point
    running = True
    while running:
        screen.fill(BG_COLOR)
        
        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:  # Left click
                    idx = get_point_at_pos(event.pos)
                    if idx is None:
                        points.append(event.pos)
                    else:
                        dragging_point = idx
                elif event.button == 3:  # Right click
                    idx = get_point_at_pos(event.pos)
                    if idx is not None:
                        points.pop(idx)
            elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                dragging_point = None
            elif event.type == pygame.MOUSEMOTION and dragging_point is not None:
                points[dragging_point] = event.pos
        
        # Generate edges and draw the polygon
        edges = generate_edges(points)
        for edge in edges:
            pygame.draw.line(screen, EDGE_COLOR, edge[0], edge[1], 2)

        # inset_points_list = inset_edges(points, edges, inset_amount=50)
        # for points_part in inset_points_list:
        #     inset_edges = generate_edges(points_part)
        #     for edge in inset_edges:
        #         pygame.draw.line(screen, EDGE_COLOR, edge[0], edge[1], 2)
        
        inset_points_list = inset_edges(points, edges, inset_amount=50)
        for points_list in inset_points_list:
            for i in range(0, len(points_list)-1):
                pygame.draw.line(screen, EDGE_COLOR, points_list[i], points_list[i+1], 2)

        # Draw points
        for p in points:
            pygame.draw.circle(screen, POINT_COLOR, p, POINT_RADIUS)

        
        pygame.display.flip()
        clock.tick(60)

    pygame.quit()


if __name__ == "__main__":
    main()
