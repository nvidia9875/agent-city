INSERT INTO agent_reasonings (agent_id, why, memory_refs)
VALUES
  (
    'A-1',
    '公式警報の遅延を踏まえ、自治体の最新情報を整理しています。',
    JSON_ARRAY(
      JSON_OBJECT('title','公式掲示','text','直近で公式の更新が掲示された。'),
      JSON_OBJECT('title','近所の噂','text','橋が危ないという話が出回っている。')
    )
  ),
  (
    'A-2',
    '最寄りの避難所を支援するために移動しています。',
    JSON_ARRAY(
      JSON_OBJECT('title','避難所通知','text','避難所の状態がOPENに更新された。')
    )
  )
ON DUPLICATE KEY UPDATE
  why = VALUES(why),
  memory_refs = VALUES(memory_refs),
  updated_at = NOW();
