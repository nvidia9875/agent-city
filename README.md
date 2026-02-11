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
- 既定では `ws://<現在ホスト>:3001` に接続します。`NEXT_PUBLIC_USE_MOCK_WS=true` のときだけ `mocks/mockWs.ts` を使います。
- DB 設定がある場合、イベントとメトリクスは Cloud SQL に保存されます。

## AI 連携（Vertex AI + Cloud SQL for MySQL）

- `POST /api/ai/reason` で住民の理由・記憶を生成し、Cloud SQL に保存します。
- `NEXT_PUBLIC_AI_ENABLED=true` のとき、住民クリックで AI 呼び出しを行います。
- WebSocket サーバーも `.env.local` を読み込みます。
- `MEMORY_PIPELINE_ENABLED=true` の場合、記憶生成 → Embedding → Vector Search upsert が動作します。
- `SIM_AI_DECISION_ENABLED=true` を有効にすると、サーバー側で AI が行動を決定します。
- 吹き出しは既定でルール生成（状態/感情/シナリオ反映）です。`SIM_FORCE_AI_BUBBLE_TEXT=true` のときのみ吹き出しLLMを有効化します。
- `SIM_ADK_ENABLED=true` の場合、ADK（Agent Development Kit）経由で行動決定を行います（失敗時は Vertex AI 直呼びにフォールバック）。

認証（ADC）

- ローカル: `gcloud auth application-default login` を実行し、`GCP_PROJECT_ID` を `.env.local` に設定します。
- Cloud Run: 実行サービスアカウントに必要な IAM を付与して ADC で動作させます（`roles/aiplatform.user` / `roles/cloudsql.client` など）。

必要な環境変数（例）:

```
GCP_PROJECT_ID=your-gcp-project
GCP_REGION=us-central1
VERTEX_AI_LOCATION=global
VERTEX_AI_MODEL_DECISION=gemini-3-flash-preview
VERTEX_AI_MODEL_REASONING=gemini-3-pro-preview
VERTEX_EMBED_MODEL=gemini-embedding-001
VERTEX_EMBED_DIM=768
AI_ENABLED=true
NEXT_PUBLIC_AI_ENABLED=true
NEXT_PUBLIC_USE_MOCK_WS=false
MEMORY_PIPELINE_ENABLED=false
VERTEX_VECTOR_INDEX_ID=your-index-id
VERTEX_VECTOR_LOCATION=us-central1
VERTEX_VECTOR_ENDPOINT_ID=your-endpoint-id
VERTEX_VECTOR_DEPLOYED_INDEX_ID=your-deployed-id
SIM_AI_DECISION_ENABLED=false
SIM_AI_DECISION_COUNT=2
SIM_FORCE_AI_BUBBLE_TEXT=false
VERTEX_AI_MODEL_TALK_BUBBLE=gemini-2.5-flash
SIM_AI_BUBBLE_SAMPLE_RATE=0.35
SIM_AI_BUBBLE_MAX_INFLIGHT=2
SIM_AI_BUBBLE_MIN_INTERVAL_MS=1200
SIM_AI_BUBBLE_GLOBAL_MIN_INTERVAL_MS=500
SIM_AI_BUBBLE_BACKOFF_MS=10000
SIM_AI_BUBBLE_BACKOFF_MAX_MS=120000
SIM_AI_BUBBLE_FALLBACK_MIN_INTERVAL_MS=900
SIM_AI_BUBBLE_ONLY_AI_AGENTS=false
SIM_ADK_ENABLED=false
# ADK (Vertex AI via ADC)
# GOOGLE_GENAI_USE_VERTEXAI=true
# GOOGLE_CLOUD_PROJECT=your-gcp-project
# GOOGLE_CLOUD_LOCATION=global
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
3. Index Endpoint を作成してデプロイし、`VERTEX_VECTOR_ENDPOINT_ID` を設定。
4. `VERTEX_VECTOR_DEPLOYED_INDEX_ID` を設定（未設定時は endpoint 上の deployed index から自動解決を試行）。

## Terraform（GCP）

```
cd infra
terraform init
terraform apply \\
  -var="project_id=your-gcp-project" \\
  -var="github_owner=your-github-owner" \\
  -var="github_repo=your-github-repo"
```

`infra/README.md` に、Terraform 出力値を GitHub Secrets / Variables に設定する手順を記載しています。

## Cloud Run デプロイ

Cloud Run では Web アプリと WebSocket サーバーを別サービスで動かします。
`NEXT_PUBLIC_*` はビルド時に埋め込まれるため、Web 側ビルド時に `NEXT_PUBLIC_WS_URL` を指定してください。

### 1) WebSocket サーバーをデプロイ

1. イメージをビルドしてレジストリへ push します。
   ```bash
   docker build -f Dockerfile.ws -t REGION-docker.pkg.dev/PROJECT_ID/REPO/agenttown-ws:latest .
   docker push REGION-docker.pkg.dev/PROJECT_ID/REPO/agenttown-ws:latest
   ```
2. Cloud Run にデプロイします。
   ```bash
  gcloud run deploy agenttown-ws \\
    --image REGION-docker.pkg.dev/PROJECT_ID/REPO/agenttown-ws:latest \\
    --region us-central1 \\
    --allow-unauthenticated \\
    --set-env-vars GCP_PROJECT_ID=your-gcp-project,GCP_REGION=us-central1,VERTEX_AI_LOCATION=global,VERTEX_AI_MODEL_DECISION=gemini-3-flash-preview,VERTEX_AI_MODEL_REASONING=gemini-3-pro-preview
   ```
3. 出力された URL を控え、`wss://` に置き換えます（例: `https://...` → `wss://...`）。

### 2) Web アプリをデプロイ

1. Web アプリのビルド時に `NEXT_PUBLIC_WS_URL` を渡します。
   ```bash
   docker build \\
     --build-arg NEXT_PUBLIC_AI_ENABLED=true \\
     --build-arg NEXT_PUBLIC_WS_URL=wss://YOUR-WS-URL \\
     -t REGION-docker.pkg.dev/PROJECT_ID/REPO/agenttown-web:latest .
   docker push REGION-docker.pkg.dev/PROJECT_ID/REPO/agenttown-web:latest
   ```
2. Cloud Run にデプロイします。
   ```bash
  gcloud run deploy agenttown-web \\
    --image REGION-docker.pkg.dev/PROJECT_ID/REPO/agenttown-web:latest \\
    --region us-central1 \\
    --allow-unauthenticated \\
    --set-env-vars GCP_PROJECT_ID=your-gcp-project,GCP_REGION=us-central1,VERTEX_AI_LOCATION=global,VERTEX_AI_MODEL_DECISION=gemini-3-flash-preview,VERTEX_AI_MODEL_REASONING=gemini-3-pro-preview
   ```

### Cloud Build でまとめて実行

`cloudbuild.yaml` に Web/WS のビルドとデプロイをまとめています。WebSocket の URL を置き換えて実行してください。

```bash
gcloud builds submit \\
  --substitutions _REGION=us-central1,_REPO=REPO,_WEB_SERVICE=agenttown-web,_WS_SERVICE=agenttown-ws,_NEXT_PUBLIC_WS_URL=wss://YOUR-WS-URL
```

### GitHub Actions で自動デプロイ

`.github/workflows/cloud-run-deploy.yml` を追加しています。`main` 更新で Web/WS を再デプロイします。

1. 先に `infra/` の Terraform を実行し、OIDC/WIF とデプロイ用 SA を作成します。
2. GitHub の Secrets に以下を追加します。
   - `GCP_PROJECT_ID`
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_SERVICE_ACCOUNT`
3. GitHub の Variables に以下を追加します（任意、未設定ならデフォルト値）。
   - `GCP_REGION`（default: `us-central1`）
   - `ARTIFACT_REPO`（default: `agenttown`）
   - `CLOUD_RUN_WEB_SERVICE`（default: `agenttown-web`）
   - `CLOUD_RUN_WS_SERVICE`（default: `agenttown-ws`）
   - `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`（Cloud Run 実行時の SA。Terraform の `service_account_email` 推奨）
   - `NEXT_PUBLIC_AI_ENABLED`（default: `true`）
   - `NEXT_PUBLIC_SIM_LOG_LEVEL`（default: `info`）
   - `VERTEX_AI_MODEL_DECISION`（default: `gemini-3-flash-preview`）
   - `VERTEX_AI_MODEL_REASONING`（default: `gemini-3-pro-preview`）
   - `VERTEX_AI_LOCATION`（default: `global` when using Gemini 3）
   - `AI_ENABLED`（default: `true`）

Terraform 適用後に `gh` で一括設定する場合:

```bash
gh auth login
./scripts/setup-github-actions-cloud-run.sh --repo your-github-owner/your-github-repo
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
