![PySpur](./docs/images/hero.png)

<p align="center"><strong>PySpur is an AI agent builder in Python. AI engineers use it to build agents, execute them step-by-step and inspect past runs.</strong></p>

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

# 🕸️ Why PySpur?

- 🖐️ **Drag-and-Drop**: Build, Test and Iterate in Seconds.
- 🔄 **Loops**: Iterative Tool Calling with Memory.
- 📤 **File Upload**: Upload files or paste URLs to process documents.
- 📋 **Structured Outputs**: UI editor for JSON Schemas.
- 🗃️ **RAG**: Parse, Chunk, Embed, and Upsert Data into a Vector DB.
- 🖼️ **Multimodal**: Support for Video, Images, Audio, Texts, Code.
- 🧰 **Tools**: Slack, Firecrawl.dev, Google Sheets, GitHub, and more.
- 🧪 **Evals**: Evaluate Agents on Real-World Datasets.
- 🚀 **One-Click Deploy**: Publish as an API and integrate wherever you want.
- 🐍 **Python-Based**: Add new nodes by creating a single Python file.
- 🎛️ **Any-Vendor-Support**: >100 LLM providers, embedders, and vector DBs.

# ⚡ Quick start

## Option A: Using `pyspur` Python Package

This is the quickest way to get started. Python 3.12 or higher is required.

1. **Install PySpur:**
    ```sh
    pip install pyspur
    ```

2. **Initialize a new project:**
    ```sh
    pyspur init my-project
    cd my-project
    ```
    This will create a new directory with a `.env` file.

3. **Start the server:**
    ```sh
    pyspur serve --sqlite
    ```
    By default, this will start PySpur app at `http://localhost:6080` using a sqlite database.
    We recommend you configure a postgres instance URL in the `.env` file to get a more stable experience.

4. **[Optional] Customize Your Deployment:**
    You can customize your PySpur deployment in two ways:

    a. **Through the app** (Recommended):
       - Navigate to the API Keys tab in the app
       - Add your API keys for various providers (OpenAI, Anthropic, etc.)
       - Changes take effect immediately

    b. **Manual Configuration**:
       - Edit the `.env` file in your project directory
       - It is recommended to configure a postgres database in .env for more reliability
       - Restart the app with `pyspur serve`. Add `--sqlite` if you are not using postgres

## Option B: Using Docker (Recommended for Scalable, In-Production Systems)

This is the recommended way for production deployments:

1. **Install Docker:**
    First, install Docker by following the official installation guide for your operating system:
    - [Docker for Linux](https://docs.docker.com/engine/install/)
    - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)

2. **Create a PySpur Project:**
    Once Docker is installed, create a new PySpur project with:
    ```sh
    curl -fsSL https://raw.githubusercontent.com/PySpur-com/pyspur/main/start_pyspur_docker.sh | bash -s pyspur-project
    ```
    This will:
    - Start a new PySpur project in a new directory called `pyspur-project`
    - Set up the necessary configuration files
    - Start PySpur app automatically backed by a local postgres docker instance

3. **Access PySpur:**
    Go to `http://localhost:6080` in your browser.

4. **[Optional] Customize Your Deployment:**
    You can customize your PySpur deployment in two ways:

    a. **Through the app** (Recommended):
       - Navigate to the API Keys tab in the app
       - Add your API keys for various providers (OpenAI, Anthropic, etc.)
       - Changes take effect immediately

    b. **Manual Configuration**:
       - Edit the `.env` file in your project directory
       - Restart the services with:
         ```sh
         docker compose up -d
         ```

That's it! Click on "New Spur" to create a workflow, or start with one of the stock templates.

# ✨ Core Benefits

## Debug at Node Level:

https://github.com/user-attachments/assets/6e82ad25-2a46-4c50-b030-415ea9994690

## Multimodal (Upload files or paste URLs)

PDFs, Videos, Audio, Images, ...

https://github.com/user-attachments/assets/83ed9a22-1ec1-4d86-9dd6-5d945588fd0b

## Loops

<img width="1919" alt="Loops" src="https://github.com/user-attachments/assets/3aea63dc-f46f-46e9-bddd-e2af9c2a56bf" />

## RAG

### Step 1) Create Document Collection (Chunking + Parsing)

https://github.com/user-attachments/assets/c77723b1-c076-4a64-a01d-6d6677e9c60e

### Step 2) Create Vector Index (Embedding + Vector DB Upsert)

https://github.com/user-attachments/assets/50e5c711-dd01-4d92-bb23-181a1c5bba25

## Modular Building Blocks

https://github.com/user-attachments/assets/6442f0ad-86d8-43d9-aa70-e5c01e55e876

## Evaluate Final Performance

https://github.com/user-attachments/assets/4dc2abc3-c6e6-4d6d-a5c3-787d518de7ae

## Coming soon: Self-improvement

https://github.com/user-attachments/assets/5bef7a16-ef9f-4650-b385-4ea70fa54c8a

# 🛠️ PySpur Development Setup
#### [ Instructions for development on Unix-like systems. Development on Windows/PC not supported ]

For development, follow these steps:

1. **Clone the repository:**
    ```sh
    git clone https://github.com/PySpur-com/pyspur.git
    cd pyspur
    ```

2. **Launch using docker-compose.dev.yml:**
    ```sh
    docker compose -f docker-compose.dev.yml up --build -d
    ```
    This will start a local instance of PySpur with hot-reloading enabled for development.

3. **Customize your setup:**
    Edit the `.env` file to configure your environment. By default, PySpur uses a local PostgreSQL database. To use an external database, modify the `POSTGRES_*` variables in `.env`.

# ⭐ Support us

You can support us in our work by leaving a star! Thank you!

![star](https://github.com/user-attachments/assets/71f65273-6755-469d-be44-087bb89d5e76)

Your feedback will be massively appreciated.
Please [tell us](mailto:founders@pyspur.dev?subject=Feature%20Request&body=I%20want%20this%20feature%3Ai) which features on that list you like to see next or request entirely new ones.
