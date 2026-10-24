"""Tests for the mainnet arrival feed (pure parts; no network)."""

import asyncio

from backend.live.mainnet import (
    GENESIS,
    INDEX_BASE,
    MainnetFeed,
    geo_xy,
    normalise_rows,
    slot_at,
    slot_start,
    wave_schedule,
)


def _row(node, seen, lat=60.17, lon=24.94, client="lighthouse", cc="FI", root="0xabc"):
    return {
        "node_id": f"hashed-{node}",
        "seen_slot_start_diff": seen,
        "meta_client_geo_latitude": lat,
        "meta_client_geo_longitude": lon,
        "meta_consensus_implementation": client,
        "meta_client_geo_country_code": cc,
        "meta_client_geo_country": "Finland",
        "meta_client_geo_city": "Helsinki",
        "block_root": root,
        "source": "beacon_api_eth_v1_events_block_gossip",
    }


def test_slot_math_round_trips():
    assert slot_at(GENESIS) == 0
    assert slot_at(GENESIS + 12 * 1000 + 5) == 1000
    assert slot_start(slot_at(1792420379)) == 1792420379


def test_geo_projection_is_equirectangular_y_down():
    assert geo_xy(0, 0) == (0.0, 0.0)
    x, y = geo_xy(60.17, 24.94)
    assert x > 0 and y < 0


def test_normalise_drops_bad_rows_and_keeps_earliest_per_node():
    rows = [
        _row("a", 1700),
        _row("a", 1500),  # same node, earlier → wins
        _row("b", 1600, lat=0, lon=0),  # no geo → dropped
        {"node_id": "", "seen_slot_start_diff": 1},  # no id → dropped
        _row("c", 2400),
    ]
    out = normalise_rows(rows)
    assert [r["node_id"] for r in out] == ["hashed-a", "hashed-c"]
    assert out[0]["seen_slot_start_diff"] == 1500


def test_wave_schedule_is_relative_and_capped():
    rows = normalise_rows([_row("a", 1500), _row("b", 1900), _row("c", 40000)])
    plan = wave_schedule(rows, max_spread_s=5.0)
    assert [d for d, _ in plan] == [0.0, 0.4, 5.0]


def test_ingest_registers_observers_with_stable_indices_and_status():
    feed = MainnetFeed(sim_time=lambda: 7.5)
    feed.enabled = True
    plan = feed.ingest_slot(100, [_row("a", 1500), _row("b", 1900, client="prysm")])
    assert [o.peer_id for _, o, _ in plan] == ["obs-a", "obs-b"]
    assert feed.get_status()["first_ms"] == 1500 and feed.get_status()["p50_ms"] == 1900
    first_index = feed._observers["a"].index
    assert first_index == INDEX_BASE
    # Next slot: same node keeps its index, states reset to idle before replay
    feed.mark_seen(plan[0][1], plan[0][2], 100, first=True)
    assert feed._observers["a"].state == "origin"
    feed.ingest_slot(101, [_row("a", 1200)])
    assert feed._observers["a"].index == first_index and feed._observers["a"].state == "idle"
    nodes = feed.get_nodes_as_peer_dicts()
    assert all(n["is_real"] and n["connected_peers"] == [] for n in nodes)


def test_mark_seen_builds_block_seen_event():
    feed = MainnetFeed(sim_time=lambda: 3.0)
    plan = feed.ingest_slot(5, [_row("a", 1434, client="teku")])
    _, o, r = plan[0]
    ev = feed.mark_seen(o, r, 5, first=True).to_dict()
    assert ev["event_type"] == "BlockSeen" and ev["category"] == "live"
    assert ev["peer_id"] == "obs-a" and ev["seen_ms"] == 1434 and ev["first"] is True
    assert ev["at"] == 3.0 and ev["client"] == "teku"


def test_loop_paces_the_wave_and_emits(monkeypatch):
    emitted = []

    async def emit(ev):
        emitted.append(ev)

    feed = MainnetFeed(
        emit=emit, sim_time=lambda: 1.0, fetch=lambda slot: [_row("a", 1500), _row("b", 1600)]
    )
    monkeypatch.setattr("backend.live.mainnet.MAX_WAVE_S", 0.2)

    async def run():
        feed.start()
        await asyncio.sleep(0.6)
        feed.stop()

    asyncio.run(run())
    assert [e.peer_id for e in emitted[:2]] == ["obs-a", "obs-b"]
    assert emitted[0].first and not emitted[1].first
    assert feed.get_nodes_as_peer_dicts() == []  # stopped → nothing merged into snapshots
