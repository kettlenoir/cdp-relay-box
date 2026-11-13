# cdp-relay-box

AI エージェントを Docker コンテナの中だけに閉じ込め、ホストの Chrome へは CDP 中継 1 本でだけ届くようにする構成。
エージェントはホストにログインできない。ホストの Tailscale は普段切断しておき、必要時だけ接続する。

## 設計の要点

1. **エージェントの居場所はコンテナの中だけ**
   入口はコンテナ内蔵の Tailscale（userspace モード、tailnet 上の独立デバイス）。
   ホスト側にエージェント用の鍵も公開ポートも置かない。
2. **ホストとの接点は CDP 中継 1 本だけ**
   ホストの Chrome は CDP を localhost（127.0.0.1:9222）でだけ待ち受ける。
   小さな中継プログラム（host/relay.py）がコンテナ専用ネットワークの玄関（172.31.0.1:9222）で受けて、localhost へ取り次ぐ。
3. **ホストの状態は「書き出し」で読む**
   エージェントはホストを実測しに行かない。ホスト側のジョブが自分の状態（負荷・メモリ・ディスク・コンテナ一覧）を JSON に書き出し、外はそれを読む。書き出し先は共有フォルダでもクラウドストレージでもよい（この実装では共有フォルダ＋Dropbox への複写）。

## 構成

```text
AIエージェント ──Tailscale──> [ cdp-relay-box (Docker) ]
                                   │  SSH (鍵はコンテナ内 /config)
                                   │  CDP は中継経由でのみ到達可
                                   ▼
                        中継 172.31.0.1:9222 ──> ホスト Chrome 127.0.0.1:9222
ホスト側ジョブ ──状態JSONを書き出し──> 共有フォルダ / クラウド（エージェントは読むだけ）
```

## 中身

| パス | 内容 |
|---|---|
| `compose.yaml` / `Dockerfile` / `entrypoint.sh` | コンテナ本体（sshd + Tailscale userspace、最小 cap、read-only ルート） |
| `config/authorized_keys.example` | エージェントの SSH 公開鍵の置き場所（実ファイルは公開しない） |
| `host/relay.py` | CDP 中継（コンテナ側ネットワーク → ホスト localhost） |
| `host/muse-cdp-relay.service` | 中継の systemd ユーザーサービス |
| `host-jobs/health.sh` | コンテナの死活監視（cron 10分ごと。異常時だけ再起動） |
| `host-jobs/write-status.sh` | ホスト状態の JSON 書き出し（cron 10分ごと） |
| `scripts/` | 箱の中から CDP で Chrome を操作するスクリプトの核（CDP ライブラリ＋生成スクリプト） |

## 動かし方（概要）

1. ホストで Chrome を CDP 有効（localhost のみ）で常駐させる
2. `host/relay.py` を systemd ユーザーサービスとして起動する
3. `config/authorized_keys` にエージェントの公開鍵を置き、`docker compose up -d`
4. コンテナ内の Tailscale を一度だけ承認する（デバイスとして参加）
5. 死活監視と状態書き出しをホストの cron に登録する

## 注意

- パスやホスト名（`/home/nb3/...` 等）は作者の環境の実値のまま。自分の環境に合わせて読み替えること
- 認証情報はファイルに含めない設計：Tailscale の状態は名前付きボリュームの中、SSH 鍵はコンテナ外に出ない
- セッション作業で増えた使い捨てスクリプト類は含めていない（核になるスクリプトのみ）
- ストレージ間の橋渡し（pCloud/Dropbox ブリッジ等）の配管は、このプロジェクトの範囲外
