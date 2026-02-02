import type { Metrics, TimelineEvent } from "@/types/sim";
import { isDbConfigured, query } from "@/lib/db/mysql";

export const saveEvent = async (event: TimelineEvent) => {
  if (!isDbConfigured()) return;
  await query(
    `INSERT INTO sim_events (id, tick, type, actors, at_x, at_y, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      event.id,
      event.tick,
      event.type,
      event.actors ? JSON.stringify(event.actors) : null,
      event.at?.x ?? null,
      event.at?.y ?? null,
      event.message ?? null,
    ]
  );
};

export const saveMetrics = async (metrics: Metrics, tick: number) => {
  if (!isDbConfigured()) return;
  await query(
    `INSERT INTO sim_metrics (tick, confusion, rumor_spread, official_reach, vulnerable_reach)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       confusion = VALUES(confusion),
       rumor_spread = VALUES(rumor_spread),
       official_reach = VALUES(official_reach),
       vulnerable_reach = VALUES(vulnerable_reach),
       created_at = NOW()`,
    [
      tick,
      metrics.confusion,
      metrics.rumorSpread,
      metrics.officialReach,
      metrics.vulnerableReach,
    ]
  );
};
