import { useEffect, useRef, useState } from "react";
import type { RemoteStats } from "@/types/global";

export const MAX_NETWORK_HISTORY_POINTS = 60;

export interface NetworkHistoryPoint {
  timestamp: number;
  rx: number;
  tx: number;
}

export interface NetworkHistorySeries {
  summary: NetworkHistoryPoint[];
  interfaces: Record<string, NetworkHistoryPoint[]>;
}

const EMPTY_NETWORK_HISTORY: NetworkHistorySeries = {
  summary: [],
  interfaces: {},
};

function appendPoint(
  points: NetworkHistoryPoint[] | undefined,
  point: NetworkHistoryPoint,
): NetworkHistoryPoint[] {
  const next = [...(points ?? []), point];
  return next.length > MAX_NETWORK_HISTORY_POINTS
    ? next.slice(next.length - MAX_NETWORK_HISTORY_POINTS)
    : next;
}

export function useNetworkHistory(
  sessionId: string | null,
  stats: RemoteStats | null,
): NetworkHistorySeries {
  const historiesRef = useRef(new Map<string, NetworkHistorySeries>());
  const lastStatsRef = useRef(new Map<string, RemoteStats>());
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (!sessionId || !stats || lastStatsRef.current.get(sessionId) === stats) return;

    lastStatsRef.current.set(sessionId, stats);
    const timestamp = Date.now();
    const current = historiesRef.current.get(sessionId) ?? EMPTY_NETWORK_HISTORY;
    const interfaces = { ...current.interfaces };

    for (const network of stats.networks) {
      interfaces[network.nic] = appendPoint(interfaces[network.nic], {
        timestamp,
        rx: network.rx_bytes_per_sec,
        tx: network.tx_bytes_per_sec,
      });
    }

    historiesRef.current.set(sessionId, {
      summary: appendPoint(current.summary, {
        timestamp,
        rx: stats.network_summary.rx_bytes_per_sec,
        tx: stats.network_summary.tx_bytes_per_sec,
      }),
      interfaces,
    });
    setRevision((revision) => revision + 1);
  }, [sessionId, stats]);

  if (!sessionId) return EMPTY_NETWORK_HISTORY;
  return historiesRef.current.get(sessionId) ?? EMPTY_NETWORK_HISTORY;
}
