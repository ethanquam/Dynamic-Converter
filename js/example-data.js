(function (global) {
  "use strict";

  function point(id, name, northing, easting, elevation, description, extras) {
    return {
      id,
      name,
      northing,
      easting,
      elevation,
      description,
      pointCode: "",
      source: "example",
      role: "none",
      adjust: false,
      ...extras,
    };
  }

  /** Point-to-point: alignment refs + two measure points offset from the line. */
  function getDistanceExample() {
    return {
      label: "Alignment offset (100 ft)",
      enableVerticalPlane: true,
      points: [
        point("ex-dist-1", "STA 0+00", 1000, 1000, 100, "Ref — alignment start", { role: "r1" }),
        point("ex-dist-2", "STA 1+00", 1100, 1000, 102, "Ref — alignment end", { role: "r2" }),
        point("ex-dist-3", "Measure A", 1020, 1003, 100.4, "3 ft east of alignment", { role: "m1" }),
        point("ex-dist-4", "Measure B", 1080, 997, 101.6, "3 ft west of alignment", { role: "m2" }),
      ],
    };
  }

  /** Grade plane: two endpoints define 2% grade; four stations checked against the plane. */
  function getPlaneExample() {
    return {
      label: "Grade check (2% over 100 ft)",
      points: [
        point("ex-plane-1", "STA 0+00", 1000, 1000, 100, "Grade plane start", { role: "p1" }),
        point("ex-plane-2", "STA 1+00", 1100, 1000, 102, "Grade plane end", { role: "p2" }),
        point("ex-plane-3", "STA 0+25", 1025, 1002, 100.35, "Measured high vs plane", { adjust: true }),
        point("ex-plane-4", "STA 0+50", 1050, 998, 101.15, "Measured low vs plane", { adjust: true }),
        point("ex-plane-5", "STA 0+75", 1075, 1001, 101.95, "Measured high vs plane", { adjust: true }),
        point("ex-plane-6", "EP East", 1090, 1004, 102.25, "Edge point to adjust", { adjust: true }),
      ],
    };
  }

  /**
   * Photo area walkway example.
   * Live trace vertices match the bundled 1024×576 photo. Field measurements leave E2 blank
   * for compute-final-edge (sanity check ~13′-3″). Reference snapshot values match the
   * annotated how-it-works image; volume check: 62.9785 ft² × 3″ = 15.7446 ft³.
   */
  function getPhotoAreaExample() {
    return {
      label: "Front walkway (field measurements)",
      imageUrl: "examples/photo-area/walkway-example.jpg?v=5",
      imageFileName: "walkway-example.jpg",
      unitSystem: "imperial-ftin",
      vertices: [
        { x: 0.919, y: 0.845 },
        { x: 0.173, y: 0.917 },
        { x: 0.142, y: 0.403 },
        { x: 0.205, y: 0.425 },
        { x: 0.565, y: 0.506 },
        { x: 0.830, y: 0.680 },
      ],
      edgeLengths: [
        "5' 7-1/2\"",
        "",
        "3'",
        "10' 4-1/2\"",
        "2' 7-1/2\"",
        "3' 0-1/2\"",
      ],
      depth: "3\"",
      runComputeFinalEdge: true,
      referenceSnapshot: {
        edges: [
          { from: 1, to: 2, pixelLength: 549.1, lengthText: "5' 7-1/2\"" },
          { from: 2, to: 3, pixelLength: 377.7, lengthText: "13'-3 1/16\"", isCheck: true },
          { from: 3, to: 4, pixelLength: 108.3, lengthText: "3'" },
          { from: 4, to: 5, pixelLength: 193.0, lengthText: "10' 4-1/2\"" },
          { from: 5, to: 6, pixelLength: 180.7, lengthText: "2' 7-1/2\"" },
          { from: 6, to: 1, pixelLength: 171.5, lengthText: "3' 0-1/2\"" },
        ],
        areaSquareFeet: 62.9785,
        depth: "3\"",
        volumeCubicFeet: 15.7446,
      },
    };
  }

  global.ExampleData = {
    getDistanceExample,
    getPlaneExample,
    getPhotoAreaExample,
  };
})(window);
