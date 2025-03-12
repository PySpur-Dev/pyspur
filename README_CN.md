![PySpur](./docs/images/hero.png)

<p align="center"><strong>PySpur 是一个基于 Python 编写的 AI 智能体构建器。AI 工程师使用它来构建智能体，逐步执行并检查过去的运行记录。</strong></p>

<p align="center">
  <a href="./README.md"><img alt="README in English" src="https://img.shields.io/badge/English-blue"></a>
  <a href="./README_CN.md"><img alt="简体中文版自述文件" src="https://img.shields.io/badge/简体中文-blue"></a>
  <a href="./README_JA.md"><img alt="日本語のREADME" src="https://img.shields.io/badge/日本語-blue"></a>
  <a href="./README_KR.md"><img alt="README in Korean" src="https://img.shields.io/badge/한국어-blue"></a>
  <a href="./README_DE.md"><img alt="Deutsche Version der README" src="https://img.shields.io/badge/Deutsch-blue"></a>
  <a href="./README_FR.md"><img alt="Version française du README" src="https://img.shields.io/badge/Français-blue"></a>
  <a href="./README_ES.md"><img alt="Versión en español del README" src="https://img.shields.io/badge/Español-blue"></a>
</p>

<p align="center">
  <a href="https://docs.pyspur.dev/" target="_blank">
    <img alt="Docs" src="https://img.shields.io/badge/Docs-green.svg?style=for-the-badge&logo=readthedocs&logoColor=white">
  </a>
  <a href="https://calendly.com/d/cnf9-57m-bv3/pyspur-founders" target="_blank">
    <img alt="Meet us" src="https://img.shields.io/badge/Meet%20us-blue.svg?style=for-the-badge&logo=calendly&logoColor=white">
  </a>
  <a href="https://forms.gle/5wHRctedMpgfNGah7" target="_blank">
    <img alt="Cloud" src="https://img.shields.io/badge/Cloud-orange.svg?style=for-the-badge&logo=cloud&logoColor=white">
  </a>
  <a href="https://discord.gg/7Spn7C8A5F">
    <img alt="Join Our Discord" src="https://img.shields.io/badge/Discord-7289DA.svg?style=for-the-badge&logo=discord&logoColor=white">
  </a>
</p>

https://github.com/user-attachments/assets/1ebf78c9-94b2-468d-bbbb-566311df16fe

# 🕸️ 为什么选择 PySpur?

- ✅ **测试驱动**：构建工作流，运行测试用例，并进行迭代。
- 👤 **人在环路中**：持久化工作流，等待人工批准或拒绝。
- 🔄 **循环**：具有记忆功能的迭代工具调用。
- 📤 **文件上传**：上传文件或粘贴 URL 来处理文档。
- 📋 **结构化输出**：JSON Schema UI 编辑器。
- 🗃️ **RAG**：解析、分块、嵌入并将数据更新到向量数据库。
- 🖼️ **多模态**：支持视频、图像、音频、文本、代码。
- 🧰 **工具**：Slack、Firecrawl.dev、Google Sheets、GitHub 等。
- 🧪 **评估**：在真实数据集上评估代理。
- 🚀 **一键部署**：发布为 API 并在任意地方集成。
- 🐍 **基于 Python**：通过创建单个 Python 文件来添加新节点。
- 🎛️ **供应商支持**：支持超过 100 个 LLM 供应商、嵌入器和向量数据库。

# ⚡ 快速开始

这是入门的最快方式。需要 Python 3.11 或更高版本。

1. **安装 PySpur:**
    ```sh
    pip install pyspur
    ```

2. **初始化新项目:**
    ```sh
    pyspur init my-project
    cd my-project
    ```
    这将创建一个包含 `.env` 文件的新目录。

3. **启动服务器:**
    ```sh
    pyspur serve --sqlite
    ```
    默认情况下，这将使用 SQLite 数据库在 `http://localhost:6080` 启动 PySpur 应用。
    我们建议你在 `.env` 文件中配置 Postgres 实例的 URL，以获得更稳定的体验。

4. **[可选] 配置环境和添加 API 密钥:**
    - **应用界面**: 导航至 API 密钥标签页添加供应商密钥（OpenAI、Anthropic 等）
    - **手动配置**: 编辑 `.env` 文件（推荐：配置 postgres）并使用 `pyspur serve` 重启

# ✨ 核心优势

## 人在环路中断点:

这些断点在达到时会暂停工作流，并在人工批准后恢复。
它们为需要质量保证的工作流提供人工监督：在工作流继续之前验证关键输出。

https://github.com/user-attachments/assets/98cb2b4e-207c-4d97-965b-4fee47c94ce8

## 节点级调试：

https://github.com/user-attachments/assets/6e82ad25-2a46-4c50-b030-415ea9994690

## 多模态（上传文件或粘贴 URL）

支持 PDF、视频、音频、图像等……

https://github.com/user-attachments/assets/83ed9a22-1ec1-4d86-9dd6-5d945588fd0b

## 循环

<img width="1919" alt="Loops" src="https://github.com/user-attachments/assets/3aea63dc-f46f-46e9-bddd-e2af9c2a56bf" />

## RAG

### 步骤 1) 创建文档集合（分块 + 解析）

https://github.com/user-attachments/assets/c77723b1-c076-4a64-a01d-6d6677e9c60e

### 步骤 2) 创建向量索引（嵌入 + 向量数据库插入）

https://github.com/user-attachments/assets/50e5c711-dd01-4d92-bb23-181a1c5bba25

## 模块化构建块

https://github.com/user-attachments/assets/6442f0ad-86d8-43d9-aa70-e5c01e55e876

## 评估最终性能

https://github.com/user-attachments/assets/4dc2abc3-c6e6-4d6d-a5c3-787d518de7ae

## 即将推出：自我提升

https://github.com/user-attachments/assets/5bef7a16-ef9f-4650-b385-4ea70fa54c8a

# 🛠️ PySpur 开发环境设置
#### [ Unix 类系统开发指南。Windows/PC 开发不支持。 ]

我们推荐使用 Cursor/VS Code 和我们的开发容器（`.devcontainer/devcontainer.json`），它提供：
- 预配置工具和扩展的一致开发环境
- 针对 Python 和 TypeScript 开发的优化设置
- 自动热重载和端口转发

**选项 1：Cursor/VS Code 开发容器（推荐）**
1. 安装 [Cursor](https://www.cursor.com/)/[VS Code](https://code.visualstudio.com/) 和 [Dev Containers 扩展](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. 克隆并打开仓库
3. 当提示时点击"在容器中重新打开"

**选项 2：手动设置**
1. **克隆仓库:**
    ```sh
    git clone https://github.com/PySpur-com/pyspur.git
    cd pyspur
    ```

2. **使用 docker-compose.dev.yml 启动:**
    ```sh
    docker compose -f docker-compose.dev.yml up --build -d
    ```

3. **自定义设置:**
    编辑 `.env` 配置环境（例如：PostgreSQL 设置）。

注意：手动设置需要额外配置，可能无法包含开发容器提供的所有功能。

# ⭐ 支持我们

你可以通过给我们项目 Star 来支持我们的工作！谢谢！

![star](https://github.com/user-attachments/assets/71f65273-6755-469d-be44-087bb89d5e76)

我们非常重视你的反馈。
请 [告诉我们](mailto:founders@pyspur.dev?subject=Feature%20Request&body=I%20want%20this%20feature%3Ai) 你想在下一次看到列表中的哪些功能或全新的功能。
