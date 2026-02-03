# GCP インフラ（Terraform）

このフォルダは Vertex AI / Vector Search と Cloud SQL（MySQL）を使うための最小構成を作成します。

## 前提

- Terraform >= 1.5
- `gcloud auth application-default login`

## 使い方

```bash
cd infra
terraform init
terraform apply -var="project_id=YOUR_PROJECT_ID"
```

出力されるサービスアカウントのメールアドレスをアプリ側の認証に利用します。
Cloud SQL の接続名、ユーザー、パスワードも出力されます。
Vector Search の Index / Endpoint の ID とリージョンも出力されます。
