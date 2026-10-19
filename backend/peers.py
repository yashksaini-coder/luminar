"""Peer-id classification shared by the simulation, faults, metrics and snapshots.

Attackers are synthetic peers the FaultInjector adds to gossip state; honest peers are
NodePool members (`peer-N`). Every "is this an attacker" decision goes through here so
adding a new attacker kind is a one-line change.
"""

from __future__ import annotations

ATTACKER_PREFIXES = ("sybil-", "eclipse-")


def is_attacker(peer_id: str) -> bool:
    return peer_id.startswith(ATTACKER_PREFIXES)


def is_honest(peer_id: str) -> bool:
    return not peer_id.startswith(ATTACKER_PREFIXES)
