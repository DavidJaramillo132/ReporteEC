"""The reference job's deterministic sample of canton pairs (pure)."""

from itertools import product

from app.modules.routing.reference import (
    LONG_PAIR_MIN_KM,
    CantonPoint,
    build_sample,
    distance_km,
)


def _grid() -> list[CantonPoint]:
    """6 x 6 cantons 0.5 degrees (~55 km) apart, plus a Galapagos canton."""
    cantons = [
        CantonPoint(f"{i:02d}{j:02d}", "09", -80.0 + 0.5 * i, -3.0 + 0.5 * j)
        for i, j in product(range(6), range(6))
    ]
    cantons.append(CantonPoint("2001", "20", -90.5, -0.7))
    return cantons


def _codes(pairs) -> list[tuple[str, str]]:
    return [(a.code, b.code) for a, b in pairs]


def test_each_canton_gets_its_5_nearest_without_duplicate_pairs():
    pairs = build_sample(_grid(), long_pairs=0)
    codes = _codes(pairs)

    assert len(codes) == len(set(codes))
    assert all(a < b for a, b in codes)  # unordered pairs, stored once
    mainland = [c for c in _grid() if c.province_code != "20"]
    for canton in mainland:
        nearest = sorted(
            (c for c in mainland if c is not canton), key=lambda c: (distance_km(canton, c), c.code)
        )[:5]
        for other in nearest:
            assert tuple(sorted((canton.code, other.code))) in codes
    # 36 cantons x 5 = 180 directed picks, fewer unordered pairs once mutual ones merge.
    assert 90 <= len(codes) < 180


def test_galapagos_is_never_sampled():
    pairs = build_sample(_grid())
    assert all("2001" not in pair for pair in _codes(pairs))


def test_long_pairs_are_far_apart_new_and_of_the_requested_count():
    short = {tuple(p) for p in _codes(build_sample(_grid(), long_pairs=0))}
    pairs = build_sample(_grid(), long_pairs=40)
    extra = [p for p in pairs if (p[0].code, p[1].code) not in short]

    assert len(extra) == 40
    assert all(distance_km(a, b) >= LONG_PAIR_MIN_KM for a, b in extra)


def test_the_same_seed_gives_the_same_pairs_and_another_seed_does_not():
    first = _codes(build_sample(_grid(), seed=7))
    assert _codes(build_sample(_grid(), seed=7)) == first
    assert _codes(build_sample(list(reversed(_grid())), seed=7)) == first
    assert _codes(build_sample(_grid(), seed=8)) != first


def test_asking_for_more_long_pairs_than_exist_takes_all_of_them():
    few = [CantonPoint("0101", "01", -79.0, -2.0), CantonPoint("0201", "02", -79.0, -3.5)]
    assert len(build_sample(few, nearest=0, long_pairs=200)) == 1
