from __future__ import annotations

from app.schemas import Allocation, Exposure, RiskCell
from app.services.exposure import infrastructure_weight
from app.services.geo import haversine_km


STAGING_POINTS = [
    ("Nowra staging", -34.8739, 150.6001),
    ("Batemans Bay staging", -35.7082, 150.1744),
    ("Wollongong staging", -34.4278, 150.8931),
    ("Canberra staging", -35.2809, 149.1300),
    ("Bega staging", -36.6739, 149.8418),
]


def priority_score(cell: RiskCell, exposure: Exposure) -> float:
    return round(cell.risk_score * (1 + exposure.population / 900) * infrastructure_weight(exposure), 4)


def nearest_staging_point(cell: RiskCell) -> tuple[str, float]:
    distances = [
        (
            name,
            haversine_km(cell.centroid["lat"], cell.centroid["lon"], lat, lon),
        )
        for name, lat, lon in STAGING_POINTS
    ]
    return min(distances, key=lambda item: item[1])


def allocate_resources(
    risk_cells: list[RiskCell],
    exposures: list[Exposure],
    horizon_hours: int,
    crews: int,
    supplies: int,
    max_distance_km: float,
) -> tuple[list[Allocation], str]:
    ortools_allocations = _allocate_with_ortools(
        risk_cells=risk_cells,
        exposures=exposures,
        horizon_hours=horizon_hours,
        crews=crews,
        supplies=supplies,
        max_distance_km=max_distance_km,
    )
    if ortools_allocations is not None:
        return ortools_allocations, "ortools-cp-sat"

    return _allocate_greedy(
        risk_cells=risk_cells,
        exposures=exposures,
        horizon_hours=horizon_hours,
        crews=crews,
        supplies=supplies,
        max_distance_km=max_distance_km,
    ), "deterministic-greedy"


def _ranked_candidates(
    risk_cells: list[RiskCell],
    exposures: list[Exposure],
    horizon_hours: int,
    max_distance_km: float,
) -> list[tuple[float, RiskCell, Exposure, str, float]]:
    exposure_by_cell = {exposure.h3_id: exposure for exposure in exposures}
    horizon_cells = [cell for cell in risk_cells if cell.horizon_hours == horizon_hours]
    candidates = []
    for cell in horizon_cells:
        if cell.h3_id not in exposure_by_cell:
            continue
        staging_name, distance = nearest_staging_point(cell)
        if distance > max_distance_km:
            continue
        exposure = exposure_by_cell[cell.h3_id]
        candidates.append((priority_score(cell, exposure), cell, exposure, staging_name, distance))
    return sorted(
        candidates,
        key=lambda item: item[0],
        reverse=True,
    )


def _allocate_greedy(
    risk_cells: list[RiskCell],
    exposures: list[Exposure],
    horizon_hours: int,
    crews: int,
    supplies: int,
    max_distance_km: float,
) -> list[Allocation]:
    ranked = _ranked_candidates(risk_cells, exposures, horizon_hours, max_distance_km)

    resources = [f"CREW-{index + 1:02d}" for index in range(crews)]
    resources += [f"SUPPLY-{index + 1:02d}" for index in range(supplies)]

    allocations: list[Allocation] = []
    assigned_cells: set[str] = set()
    for resource_id in resources:
        for score, cell, exposure, staging_name, distance in ranked:
            if cell.h3_id in assigned_cells:
                continue
            assigned_cells.add(cell.h3_id)
            allocations.append(_build_allocation(resource_id, score, cell, exposure, horizon_hours, staging_name, distance))
            break

    return allocations


def _allocate_with_ortools(
    risk_cells: list[RiskCell],
    exposures: list[Exposure],
    horizon_hours: int,
    crews: int,
    supplies: int,
    max_distance_km: float,
) -> list[Allocation] | None:
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return None

    ranked = _ranked_candidates(risk_cells, exposures, horizon_hours, max_distance_km)
    resources = [f"CREW-{index + 1:02d}" for index in range(crews)]
    resources += [f"SUPPLY-{index + 1:02d}" for index in range(supplies)]
    if not ranked or not resources:
        return []

    model = cp_model.CpModel()
    assignment_vars = {
        (resource_index, candidate_index): model.NewBoolVar(f"x_{resource_index}_{candidate_index}")
        for resource_index in range(len(resources))
        for candidate_index in range(len(ranked))
    }

    for resource_index in range(len(resources)):
        model.Add(sum(assignment_vars[(resource_index, candidate_index)] for candidate_index in range(len(ranked))) <= 1)
    for candidate_index in range(len(ranked)):
        model.Add(sum(assignment_vars[(resource_index, candidate_index)] for resource_index in range(len(resources))) <= 1)

    # CP-SAT needs integer objectives. Scale while preserving the sorted priority relationship.
    model.Maximize(
        sum(
            int(score * 1_000_000) * assignment_vars[(resource_index, candidate_index)]
            for resource_index in range(len(resources))
            for candidate_index, (score, *_rest) in enumerate(ranked)
        )
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    solver.parameters.num_search_workers = 1
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    selected: list[tuple[int, int]] = []
    for resource_index in range(len(resources)):
        for candidate_index in range(len(ranked)):
            if solver.Value(assignment_vars[(resource_index, candidate_index)]) == 1:
                selected.append((resource_index, candidate_index))

    allocations: list[Allocation] = []
    for resource_index, candidate_index in sorted(selected):
        score, cell, exposure, staging_name, distance = ranked[candidate_index]
        allocations.append(
            _build_allocation(resources[resource_index], score, cell, exposure, horizon_hours, staging_name, distance)
        )
    return allocations


def _build_allocation(
    resource_id: str,
    score: float,
    cell: RiskCell,
    exposure: Exposure,
    horizon_hours: int,
    staging_name: str,
    distance: float,
) -> Allocation:
    eta_minutes = int(24 + distance / 0.95)
    rationale = (
        f"{cell.risk_score:.0%} {horizon_hours}h risk, "
        f"{exposure.population:,} exposed people, "
        f"{exposure.hospitals} hospitals, {exposure.schools} schools."
    )
    return Allocation(
        resource_id=resource_id,
        assigned_h3_id=cell.h3_id,
        priority_score=score,
        rationale=rationale,
        staging_point=staging_name,
        eta_minutes=eta_minutes,
    )
