# GCP インフラ（Terraform）

このフォルダは、Cloud Run デプロイの初期セットアップに必要なリソースを作成します。

- Artifact Registry（コンテナイメージ保存先）
- GitHub Actions 用 Workload Identity Federation（OIDC）
- GitHub Actions 用デプロイサービスアカウント
- Cloud Run 実行用サービスアカウント
- Cloud SQL（MySQL）
- Vertex AI / Vector Search

## 前提

- Terraform >= 1.5
- `gcloud auth application-default login`
- GCP プロジェクトで課金が有効

## 1. Terraform 実行

`github_owner` と `github_repo` は必須です。

```bash
cd infra
terraform init
terraform apply \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="github_owner=YOUR_GITHUB_OWNER" \
  -var="github_repo=YOUR_GITHUB_REPO"
```

## 2. GitHub Secrets 設定

Terraform 出力値を GitHub Repository Secrets に設定します。

- `GCP_PROJECT_ID` = あなたの GCP プロジェクトID
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = `terraform output -raw github_workload_identity_provider`
- `GCP_SERVICE_ACCOUNT` = `terraform output -raw github_actions_service_account_email`

## 3. GitHub Variables 設定（推奨）

以下は Repository Variables に設定します（未設定時は workflow のデフォルト値を使用）。

- `GCP_REGION` = `us-central1` など
- `ARTIFACT_REPO` = `terraform output -raw artifact_registry_repository`
- `CLOUD_RUN_WEB_SERVICE` = `agenttown-web`
- `CLOUD_RUN_WS_SERVICE` = `agenttown-ws`
- `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT` = `terraform output -raw service_account_email`

必要に応じて AI 関連の Variables も設定できます。

- `NEXT_PUBLIC_AI_ENABLED`
- `NEXT_PUBLIC_SIM_LOG_LEVEL`
- `VERTEX_AI_MODEL_DECISION`
- `VERTEX_AI_MODEL_REASONING`
- `VERTEX_AI_LOCATION`
- `AI_ENABLED`

## 3.5 GitHub 設定を自動投入する

`gh` CLI が使える場合は、Terraform 出力値を直接 GitHub へ反映できます。

```bash
gh auth login
./scripts/setup-github-actions-cloud-run.sh --repo YOUR_GITHUB_OWNER/YOUR_GITHUB_REPO
```

事前確認だけしたい場合:

```bash
./scripts/setup-github-actions-cloud-run.sh --repo YOUR_GITHUB_OWNER/YOUR_GITHUB_REPO --dry-run
```

## 4. デプロイ

`main` ブランチに push するか、GitHub Actions の `Deploy to Cloud Run` を `workflow_dispatch` で実行してください。

## 5. 予算アラート + 自動公開停止（任意）

月次予算を超えたときにメール通知し、Cloud Run の公開アクセスを自動停止できます。

```bash
cd infra
terraform apply \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="github_owner=YOUR_GITHUB_OWNER" \
  -var="github_repo=YOUR_GITHUB_REPO" \
  -var="enable_budget_controls=true" \
  -var="billing_account_id=YOUR_BILLING_ACCOUNT_ID" \
  -var="budget_alert_email=YOUR_EMAIL" \
  -var="budget_amount=80000"
```

設定される内容:

- Cloud Billing Budget（月次 80,000 JPY）
- 予算閾値メール通知（Monitoring Notification Channel）
- Pub/Sub 通知
- 通知を受けて Cloud Run 公開停止する Cloud Functions Gen2

予算超過時の停止動作:

- Cloud Run `allUsers` Invoker を削除
- Cloud Run ingress を `INTERNAL_ONLY` に変更

## 主な出力値

- `service_account_email`: Cloud Run 実行用サービスアカウント
- `github_actions_service_account_email`: GitHub Actions 用デプロイサービスアカウント
- `github_workload_identity_provider`: GitHub Actions 認証に使う WIF Provider 名
- `artifact_registry_path`: `REGION-docker.pkg.dev/PROJECT/REPO` 形式のイメージパス
- `budget_controls_enabled`: 予算制御の有効/無効
- `budget_alert_topic`: 予算通知用 Pub/Sub topic
- `budget_guard_function_name`: 予算ガード関数名
- `db_*`: Cloud SQL 接続情報
- `vector_*`: Vector Search の Index / Endpoint 情報
