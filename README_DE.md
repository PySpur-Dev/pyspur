![PySpur](./docs/images/hero.png)

<p align="center"><strong>PySpur ist ein KI-Agenten-Builder in Python. KI-Entwickler nutzen ihn, um Agenten zu erstellen, sie Schritt für Schritt auszuführen und vergangene Durchläufe zu analysieren.</strong></p>

<p align="center">
  <a href="./README.md"><img alt="README auf Englisch" src="https://img.shields.io/badge/English-blue"></a>
  <a href="./README_CN.md"><img alt="README auf vereinfachtem Chinesisch" src="https://img.shields.io/badge/简体中文-blue"></a>
  <a href="./README_JA.md"><img alt="README auf Japanisch" src="https://img.shields.io/badge/日本語-blue"></a>
  <a href="./README_KR.md"><img alt="README auf Koreanisch" src="https://img.shields.io/badge/한국어-blue"></a>
  <a href="./README_DE.md"><img alt="Deutsche Version der README" src="https://img.shields.io/badge/Deutsch-blue"></a>
  <a href="./README_FR.md"><img alt="README auf Französisch" src="https://img.shields.io/badge/Français-blue"></a>
  <a href="./README_ES.md"><img alt="README auf Spanisch" src="https://img.shields.io/badge/Español-blue"></a>
</p>

<p align="center">
  <a href="https://docs.pyspur.dev/" target="_blank">
    <img alt="Dokumentation" src="https://img.shields.io/badge/Docs-green.svg?style=for-the-badge&logo=readthedocs&logoColor=white">
  </a>
  <a href="https://calendly.com/d/cnf9-57m-bv3/pyspur-founders" target="_blank">
    <img alt="Treffen Sie uns" src="https://img.shields.io/badge/Meet%20us-blue.svg?style=for-the-badge&logo=calendly&logoColor=white">
  </a>
  <a href="https://forms.gle/5wHRctedMpgfNGah7" target="_blank">
    <img alt="Cloud" src="https://img.shields.io/badge/Cloud-orange.svg?style=for-the-badge&logo=cloud&logoColor=white">
  </a>
  <a href="https://discord.gg/7Spn7C8A5F">
    <img alt="Discord beitreten" src="https://img.shields.io/badge/Discord-7289DA.svg?style=for-the-badge&logo=discord&logoColor=white">
  </a>
</p>

https://github.com/user-attachments/assets/1ebf78c9-94b2-468d-bbbb-566311df16fe

# 🕸️ Warum PySpur?

- ✅ **Testgetrieben**: Erstellen Sie Workflows, führen Sie Testfälle aus und iterieren Sie.
- 👤 **Human in the Loop**: Persistente Workflows, die auf Genehmigung oder Ablehnung des Users warten.
- 🔄 **Loops**: Wiederholte Toolaufrufe mit Zwischenspeicherung.
- 📤 **Datei-Upload**: Laden Sie Dateien hoch oder fügen Sie URLs ein, um Dokumente zu verarbeiten.
- 📋 **Strukturierte Outputs**: UI-Editor für JSON-Schemata.
- 🗃️ **RAG**: Daten parsen, in Abschnitte unterteilen, einbetten und in eine Vektor-Datenbank einfügen/aktualisieren.
- 🖼️ **Multimodal**: Unterstützung für Video, Bilder, Audio, Texte, Code.
- 🧰 **Tools**: Slack, Firecrawl.dev, Google Sheets, GitHub und mehr.
- 🧪 **Evaluierungen**: Bewerten Sie Agenten anhand von realen Datensätzen.
- 🚀 **One-Click Deploy**: Veröffentlichen Sie Ihre Lösung als API und integrieren Sie sie überall.
- 🐍 **Python-basiert**: Fügen Sie neue Knoten hinzu, indem Sie eine einzige Python-Datei erstellen.
- 🎛️ **Support für jeden Anbieter**: Über 100 LLM-Anbieter, Einbettungslösungen und Vektor-Datenbanken.

# ⚡ Schnellstart

Dies ist der schnellste Weg, um loszulegen. Python 3.11 oder höher wird benötigt.

1. **PySpur installieren:**
    ```sh
    pip install pyspur
    ```

2. **Ein neues Projekt initialisieren:**
    ```sh
    pyspur init my-project
    cd my-project
    ```
    Dadurch wird ein neues Verzeichnis mit einer `.env`-Datei erstellt.

3. **Den Server starten:**
    ```sh
    pyspur serve --sqlite
    ```
    Standardmäßig startet dies die PySpur-App unter `http://localhost:6080` mit einer SQLite-Datenbank.
    Wir empfehlen, in der `.env`-Datei eine PostgreSQL-Instanz-URL zu konfigurieren, um eine stabilere Erfahrung zu gewährleisten.

4. **[Optional] Umgebung konfigurieren und API-Schlüssel hinzufügen:**
    - **App-Oberfläche**: Navigieren Sie zum Tab „API Keys", um Anbieter-Schlüssel hinzuzufügen (OpenAI, Anthropic usw.)
    - **Manuelle Konfiguration**: Bearbeiten Sie die `.env`-Datei (empfohlen: PostgreSQL konfigurieren) und starten Sie mit `pyspur serve` neu

# ✨ Kernvorteile

## Mensch-im-Regelkreis-Haltepunkte:

Diese Haltepunkte pausieren den Workflow, wenn sie erreicht werden, und setzen ihn fort, sobald ein Mensch ihn genehmigt.
Sie ermöglichen menschliche Aufsicht für Workflows, die Qualitätssicherung erfordern: Überprüfen Sie kritische Ausgaben, bevor der Workflow fortgesetzt wird.

https://github.com/user-attachments/assets/98cb2b4e-207c-4d97-965b-4fee47c94ce8

## Debuggen auf Node-Ebene:

https://github.com/user-attachments/assets/6e82ad25-2a46-4c50-b030-415ea9994690

## Multimodal (Dateien hochladen oder URLs einfügen)

PDFs, Videos, Audio, Bilder, ...

https://github.com/user-attachments/assets/83ed9a22-1ec1-4d86-9dd6-5d945588fd0b

## Loops

<img width="1919" alt="Loops" src="https://github.com/user-attachments/assets/3aea63dc-f46f-46e9-bddd-e2af9c2a56bf" />

## RAG

### Schritt 1) Erstellen einer Dokumentensammlung (Chunking + Parsing)

https://github.com/user-attachments/assets/c77723b1-c076-4a64-a01d-6d6677e9c60e

### Schritt 2) Erstellen eines Vektorindex (Einbettung + Einfügen/Aktualisieren in der Vektor-Datenbank)

https://github.com/user-attachments/assets/50e5c711-dd01-4d92-bb23-181a1c5bba25

## Modulare Bausteine

https://github.com/user-attachments/assets/6442f0ad-86d8-43d9-aa70-e5c01e55e876

## Endgültige Leistung bewerten

https://github.com/user-attachments/assets/4dc2abc3-c6e6-4d6d-a5c3-787d518de7ae

## Demnächst: Selbstverbesserung

https://github.com/user-attachments/assets/5bef7a16-ef9f-4650-b385-4ea70fa54c8a

# 🛠️ PySpur Entwicklungs-Setup
#### [ Anweisungen für die Entwicklung auf Unix-ähnlichen Systemen. Entwicklung auf Windows/PC wird nicht unterstützt ]

Für die Entwicklung folgen Sie diesen Schritten:

1. **Das Repository klonen:**
    ```sh
    git clone https://github.com/PySpur-com/pyspur.git
    cd pyspur
    ```

2. **Mit docker-compose.dev.yml starten:**
    ```sh
    docker compose -f docker-compose.dev.yml up --build -d
    ```
    Dadurch wird eine lokale Instanz von PySpur mit aktiviertem Hot-Reloading für die Entwicklung gestartet.

3. **Ihre Einrichtung anpassen:**
    Bearbeiten Sie die `.env`-Datei, um Ihre Umgebung zu konfigurieren. Standardmäßig verwendet PySpur eine lokale PostgreSQL-Datenbank. Um eine externe Datenbank zu nutzen, ändern Sie die `POSTGRES_*`-Variablen in der `.env`.

# ⭐ Unterstützen Sie uns

Sie können uns bei unserer Arbeit unterstützen, indem Sie einen Stern hinterlassen! Vielen Dank!

![star](https://github.com/user-attachments/assets/71f65273-6755-469d-be44-087bb89d5e76)

Ihr Feedback wird sehr geschätzt.
Bitte [sagen Sie uns](mailto:founders@pyspur.dev?subject=Feature%20Request&body=I%20want%20this%20feature%3Ai), welche Funktionen aus dieser Liste Sie als Nächstes sehen möchten oder schlagen Sie ganz neue vor.
