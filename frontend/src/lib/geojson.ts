import type { Allocation, Hotspot, RevealResponse, RiskCell } from "./types";

export function riskFeatureCollection(cells: RiskCell[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      id: cell.h3_id,
      geometry: cell.geometry,
      properties: {
        h3_id: cell.h3_id,
        risk: cell.risk_score,
        horizon: cell.horizon_hours,
      },
    })),
  };
}

export function hotspotFeatureCollection(hotspots: Hotspot[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hotspots.map((hotspot, index) => ({
      type: "Feature",
      id: `hotspot-${index}`,
      geometry: hotspot.geometry,
      properties: {
        confidence: hotspot.confidence,
        intensity: hotspot.intensity,
      },
    })),
  };
}

export function allocationFeatureCollection(
  allocations: Allocation[],
  cellsById: Map<string, RiskCell>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: allocations.flatMap((allocation) => {
      const cell = cellsById.get(allocation.assigned_h3_id);
      if (!cell) {
        return [];
      }
      return [
        {
          type: "Feature" as const,
          id: allocation.resource_id,
          geometry: {
            type: "Point" as const,
            coordinates: [cell.centroid.lon, cell.centroid.lat],
          },
          properties: {
            resource_id: allocation.resource_id,
            priority_score: allocation.priority_score,
          },
        },
      ];
    }),
  };
}

export function revealCellFeatureCollection(reveal: RevealResponse | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (reveal?.comparison_cells ?? []).map((cell) => ({
      type: "Feature",
      id: `${cell.status}-${cell.h3_id}`,
      geometry: cell.geometry,
      properties: {
        h3_id: cell.h3_id,
        status: cell.status,
        risk_score: cell.risk_score,
      },
    })),
  };
}

export function futureHotspotFeatureCollection(reveal: RevealResponse | null): GeoJSON.FeatureCollection {
  return hotspotFeatureCollection(reveal?.actual_hotspots ?? []);
}
