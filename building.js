// Class that stores building info
export class Building {
    constructor(polygon, deflationAmount, floorHeight, floorCount, roofHeight, windowDistance, doorModel, windowModel, bottomFloorWindowModel) {
        this.polygon = polygon; // The polygon representing the building's footprint
        this.deflationAmount = deflationAmount; // Amount to deflate the polygon
        this.floorHeight = floorHeight; // Height of each floor
        this.floorCount = floorCount; // Number of floors
        this.roofHeight = roofHeight; // Height of the roof above the last floor
        this.windowDistance = windowDistance; // Distance between windows
        this.doorModel = doorModel; // Model for the door
        this.windowModel = windowModel; // Model for the windows
        this.bottomFloorWindowModel = bottomFloorWindowModel; // Model for windows on the bottom floor
    }
}

