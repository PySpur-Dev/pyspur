![PySpur](./docs/images/hero.png)

<p align="center"><strong>PySpurはPython製のAIエージェントビルダーです。AIエンジニアはこれを利用してエージェントを構築し、ステップバイステップで実行し、過去の実行結果を検証します。</strong></p>

<p align="center">
  <a href="./README.md"><img alt="英語版README" src="https://img.shields.io/badge/English-blue"></a>
  <a href="./README_CN.md"><img alt="简体中文版自述文件" src="https://img.shields.io/badge/简体中文-blue"></a>
  <a href="./README_JA.md"><img alt="日本語のREADME" src="https://img.shields.io/badge/日本語-blue"></a>
  <a href="./README_KR.md"><img alt="韓国語版README" src="https://img.shields.io/badge/한국어-blue"></a>
  <a href="./README_DE.md"><img alt="ドイツ語版README" src="https://img.shields.io/badge/Deutsch-blue"></a>
  <a href="./README_FR.md"><img alt="フランス語版README" src="https://img.shields.io/badge/Français-blue"></a>
  <a href="./README_ES.md"><img alt="スペイン語版README" src="https://img.shields.io/badge/Español-blue"></a>
</p>

<p align="center">
  <a href="https://docs.pyspur.dev/" target="_blank">
    <img alt="ドキュメント" src="https://img.shields.io/badge/Docs-green.svg?style=for-the-badge&logo=readthedocs&logoColor=white">
  </a>
  <a href="https://calendly.com/d/cnf9-57m-bv3/pyspur-founders" target="_blank">
    <img alt="お会いしましょう" src="https://img.shields.io/badge/Meet%20us-blue.svg?style=for-the-badge&logo=calendly&logoColor=white">
  </a>
  <a href="https://forms.gle/5wHRctedMpgfNGah7" target="_blank">
    <img alt="クラウド" src="https://img.shields.io/badge/Cloud-orange.svg?style=for-the-badge&logo=cloud&logoColor=white">
  </a>
  <a href="https://discord.gg/7Spn7C8A5F">
    <img alt="Discordに参加する" src="https://img.shields.io/badge/Discord-7289DA.svg?style=for-the-badge&logo=discord&logoColor=white">
  </a>
</p>

https://github.com/user-attachments/assets/1ebf78c9-94b2-468d-bbbb-566311df16fe

# 🕸️ なぜ PySpur なのか？

- 🖐️ **ドラッグ＆ドロップ**: 数秒で構築、テスト、反復できます。
- 🔄 **ループ**: メモリを活用した反復的なツール呼び出し。
- 📤 **ファイルアップロード**: ファイルのアップロードやURLの貼り付けによりドキュメントを処理します。
- 📋 **構造化された出力**: JSONスキーマ用のUIエディタ。
- 🗃️ **RAG**: データを解析、分割、埋め込み、そしてVector DBにアップサートします。
- 🖼️ **マルチモーダル**: ビデオ、画像、オーディオ、テキスト、コードに対応。
- 🧰 **ツール**: Slack、Firecrawl.dev、Google Sheets、GitHubなど多数。
- 🧪 **評価**: 実際のデータセットでエージェントを評価します。
- 🚀 **ワンクリックデプロイ**: APIとして公開し、どこにでも統合可能。
- 🐍 **Pythonベース**: 単一のPythonファイルを作成するだけで新しいノードを追加できます。
- 🎛️ **どのベンダーにも対応**: 100以上のLLMプロバイダー、エンベッダー、Vector DBに対応。

# ⚡ クイックスタート

## オプション A: `pyspur` Pythonパッケージの使用

これは最も迅速なスタート方法です。Python 3.12以上が必要です。

1. **PySpurのインストール:**
    ```sh
    pip install pyspur
    ```

2. **新しいプロジェクトの初期化:**
    ```sh
    pyspur init my-project
    cd my-project
    ```
    これにより、`.env`ファイルを含む新しいディレクトリが作成されます。

3. **サーバーの起動:**
    ```sh
    pyspur serve --sqlite
    ```
    デフォルトでは、SQLiteデータベースを使用して `http://localhost:6080` でPySpurアプリが起動します。より安定した動作を求める場合は、`.env`ファイルにPostgresのインスタンスURLを設定することを推奨します。

4. **[オプション] デプロイのカスタマイズ:**
    PySpurのデプロイは以下の2通りの方法でカスタマイズできます：

    a. **アプリ内から** (推奨):
       - アプリ内の「APIキー」タブに移動する
       - 各種プロバイダー（OpenAI、Anthropicなど）のAPIキーを追加する
       - 変更は即座に反映される

    b. **手動設定**:
       - プロジェクトディレクトリ内の `.env` ファイルを編集する
       - より信頼性を高めるために、`.env`でPostgresデータベースを設定することを推奨
       - `pyspur serve` でアプリを再起動する。Postgresを使用していない場合は `--sqlite` を追加する

## オプション B: Dockerの利用（スケーラブルな本番システム向けに推奨）

本番環境でのデプロイにはこちらの方法を推奨します：

1. **Dockerのインストール:**
    まず、お使いのOSに合わせた公式インストールガイドに従い、Dockerをインストールしてください：
    - [Docker for Linux](https://docs.docker.com/engine/install/)
    - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)

2. **PySpurプロジェクトの作成:**
    Dockerをインストールしたら、以下のコマンドで新しいPySpurプロジェクトを作成します：
    ```sh
    curl -fsSL https://raw.githubusercontent.com/PySpur-com/pyspur/main/start_pyspur_docker.sh | bash -s pyspur-project
    ```
    このコマンドは以下の処理を行います：
    - `pyspur-project` という新しいディレクトリ内にPySpurプロジェクトを作成
    - 必要な設定ファイルを構成
    - ローカルのPostgres Dockerインスタンスをバックエンドに、PySpurアプリを自動で起動

3. **PySpurへのアクセス:**
    ブラウザで `http://localhost:6080` にアクセスしてください。

4. **[オプション] デプロイのカスタマイズ:**
    a. **アプリ内から** (推奨):
       - アプリ内の「APIキー」タブに移動する
       - 各種プロバイダー（OpenAI、Anthropicなど）のAPIキーを追加する
       - 変更は即座に反映される

    b. **手動設定**:
       - プロジェクトディレクトリ内の `.env` ファイルを編集する
       - 以下のコマンドでサービスを再起動する：
         ```sh
         docker compose up -d
         ```

以上です！「New Spur」をクリックしてワークフローを作成するか、標準テンプレートから開始してください。

# ✨ 主な利点

## ノードレベルでのデバッグ:

https://github.com/user-attachments/assets/6e82ad25-2a46-4c50-b030-415ea9994690

## マルチモーダル（ファイルアップロードまたはURL貼り付け）

PDF、ビデオ、オーディオ、画像、…

https://github.com/user-attachments/assets/83ed9a22-1ec1-4d86-9dd6-5d945588fd0b

## ループ

<img width="1919" alt="Loops" src="https://github.com/user-attachments/assets/3aea63dc-f46f-46e9-bddd-e2af9c2a56bf" />

## RAG

### ステップ 1) ドキュメントコレクションの作成（チャンク分割＋解析）

https://github.com/user-attachments/assets/c77723b1-c076-4a64-a01d-6d6677e9c60e

### ステップ 2) ベクターインデックスの作成（埋め込み＋Vector DBアップサート）

https://github.com/user-attachments/assets/50e5c711-dd01-4d92-bb23-181a1c5bba25

## モジュール式ビルディングブロック

https://github.com/user-attachments/assets/6442f0ad-86d8-43d9-aa70-e5c01e55e876

## 最終パフォーマンスの評価

https://github.com/user-attachments/assets/4dc2abc3-c6e6-4d6d-a5c3-787d518de7ae

## 近日公開予定：自己改善

https://github.com/user-attachments/assets/5bef7a16-ef9f-4650-b385-4ea70fa54c8a

# 🛠️ PySpur 開発環境セットアップ
#### [ Unix系システムでの開発向けの手順です。Windows/PCでの開発はサポートされていません ]

開発のためには、以下の手順に従ってください：

1. **リポジトリのクローン:**
    ```sh
    git clone https://github.com/PySpur-com/pyspur.git
    cd pyspur
    ```

2. **docker-compose.dev.ymlを使用して起動:**
    ```sh
    docker compose -f docker-compose.dev.yml up --build -d
    ```
    これにより、開発用にホットリロードが有効なPySpurのローカルインスタンスが起動します。

3. **セットアップのカスタマイズ:**
    環境設定のために `.env` ファイルを編集してください。デフォルトでは、PySpurはローカルのPostgreSQLデータベースを使用しています。外部データベースを使用する場合は、`.env` 内の `POSTGRES_*` 変数を変更してください.

# ⭐ サポート

スターを押していただくことで、私たちの活動をサポートしていただけます。ありがとうございます！

![star](https://github.com/user-attachments/assets/71f65273-6755-469d-be44-087bb89d5e76)

皆様のフィードバックを大変ありがたく思います。
次にどの機能を見たいか、または全く新しい機能のリクエストがあれば、ぜひ[お知らせください](mailto:founders@pyspur.dev?subject=Feature%20Request&body=I%20want%20this%20feature%3Ai).