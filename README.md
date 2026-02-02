# AgentTown

AgentTown は、災害対応の「予行演習」を可視化する Next.js + React Three Fiber のデモです。`/sim` ではアイソメ視点の街、噂/公式情報/避難行動のタイムライン、介入操作を表示します。住民は脆弱性（高齢者/子ども/非日本語話者など）を持ち、情報の届き方に応じて行動が変化します。

## スクリプト

- `npm run dev`: 開発サーバーを起動（`http://localhost:3000`）。
- `npm run build`: 本番ビルドを生成。
- `npm run start`: ビルド後の本番サーバー起動。
- `npm run lint`: ESLint を実行。

## ルーティング

- `/`: ランディングページ。
- `/sim`: シミュレーション本体（3D 街 + HUD）。

## データフロー

- `server/index.ts` が `WORLD_INIT` / `WORLD_DIFF` / `EVENT` / `METRICS` を WebSocket で配信します。
- `/sim` 初期表示時に設定モーダルが開き、`INIT_SIM` でサイズ/人数/建物/地形を送信してからシミュレーションを開始します。
- `mocks/mockWorld.ts` がタイル、建物、住民、脆弱性属性を設定に応じて初期生成します。
- `NEXT_PUBLIC_WS_URL` が未設定の場合は `mocks/mockWs.ts` を使ってローカル完結で動作します。
- DB 設定がある場合、イベントとメトリクスは Cloud SQL に保存されます。

## AI 連携（Vertex AI + Cloud SQL for MySQL）

- `POST /api/ai/reason` で住民の理由・記憶を生成し、Cloud SQL に保存します。
- `NEXT_PUBLIC_AI_ENABLED=true` のとき、住民クリックで AI 呼び出しを行います。
- WebSocket サーバーも `.env.local` を読み込みます。
- `MEMORY_PIPELINE_ENABLED=true` の場合、記憶生成 → Embedding → Vector Search upsert が動作します。
- `SIM_AI_DECISION_ENABLED=true` を有効にすると、サーバー側で AI が行動を決定します。
- `SIM_ADK_ENABLED=true` の場合、ADK（Agent Development Kit）経由で行動決定を行います（失敗時は Vertex AI 直呼びにフォールバック）。

認証（ADC）

- ローカル: `gcloud auth application-default login` を実行し、`GCP_PROJECT_ID` を `.env.local` に設定します。
- Cloud Run: 実行サービスアカウントに必要な IAM を付与して ADC で動作させます（`roles/aiplatform.user` / `roles/cloudsql.client` など）。

必要な環境変数（例）:

```
GCP_PROJECT_ID=your-gcp-project
GCP_REGION=us-central1
VERTEX_AI_MODEL=gemini-1.5-pro-001
VERTEX_EMBED_MODEL=gemini-embedding-001
VERTEX_EMBED_DIM=768
AI_ENABLED=true
NEXT_PUBLIC_AI_ENABLED=true
MEMORY_PIPELINE_ENABLED=false
VERTEX_VECTOR_INDEX_ID=your-index-id
VERTEX_VECTOR_LOCATION=us-central1
SIM_AI_DECISION_ENABLED=false
SIM_AI_DECISION_COUNT=2
SIM_ADK_ENABLED=false
# ADK (Vertex AI via ADC)
# GOOGLE_GENAI_USE_VERTEXAI=true
# GOOGLE_CLOUD_PROJECT=your-gcp-project
# GOOGLE_CLOUD_LOCATION=us-central1
NEXT_PUBLIC_WS_URL=ws://localhost:3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=agenttown
DB_PASSWORD=your-password
DB_NAME=agenttown
DB_SSL=false
DATABASE_URL=mysql://agenttown:your-password@127.0.0.1:3306/agenttown
```

## Cloud SQL セットアップ（ローカル実行用）

```
DB_HOST=127.0.0.1 DB_USER=agenttown DB_PASSWORD=your-password DB_NAME=agenttown ./scripts/mysql/init.sh
DB_HOST=127.0.0.1 DB_USER=agenttown DB_PASSWORD=your-password DB_NAME=agenttown ./scripts/mysql/seed.sh
```

## Vertex AI Vector Search セットアップ

1. Vertex AI の Vector Search で Index を作成（埋め込み次元は `VERTEX_EMBED_DIM` と一致させる）。
2. Index ID を控え、`.env.local` の `VERTEX_VECTOR_INDEX_ID` に設定。
3. 将来的に検索を使う場合は Index Endpoint を作成してデプロイしておく。

## Terraform（GCP）

```
cd infra
terraform init
terraform apply -var="project_id=your-gcp-project"
```

## 動作確認手順

1. 依存関係をインストールします。
   ```bash
   npm install
   ```
2. WebSocket サーバーを起動します（別ターミナル）。
   ```bash
   npm run dev:server
   ```
3. 開発サーバーを起動します。
   ```bash
   npm run dev
   ```
4. ブラウザで `http://localhost:3000/sim` を開き、
   - 初期表示のモーダルでサイズ/人数/建物/地形を選び、Start で開始
   - アイソメ視点の街が描画される
   - 住民が滑らかに移動する（脆弱層は動きが遅い）
   - TopHud に「混乱度 / 噂拡散 / 公式到達 / 要支援到達」が表示される
   - タイムラインに「警報 / 噂 / 避難 / 支援 / 安否」イベントが流れる
   - 住民・建物にホバーで吹き出し表示、クリックで固定できる
   ことを確認してください。
